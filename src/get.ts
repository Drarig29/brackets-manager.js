import { Stage, Group, Round, Match, MatchGame, Participant } from 'brackets-model';
import { Database, FinalStandingsItem, ParticipantSlot } from './types';
import { BaseGetter } from './base/getter';
import * as helpers from './helpers';

export class Get extends BaseGetter {

    /**
     * Returns the data needed to display a stage.
     *
     * @param stageId ID of the stage.
     */
    public async stageData(stageId: number): Promise<Database> {
        const stageData = await this.getStageSpecificData(stageId);

        const participants = await this.storage.select('participant', { tournament_id: stageData.stage.tournament_id });
        if (!participants) throw Error('Error getting participants.');

        return {
            stage: [stageData.stage],
            group: stageData.groups,
            round: stageData.rounds,
            match: stageData.matches,
            match_game: stageData.matchGames,
            participant: participants,
        };
    }

    /**
     * Returns the data needed to display a whole tournament with all its stages.
     *
     * @param tournamentId ID of the tournament.
     */
    public async tournamentData(tournamentId: number): Promise<Database> {
        const stages = await this.storage.select('stage', { tournament_id: tournamentId });
        if (!stages) throw Error('Error getting stages.');

        const stagesData = await Promise.all(stages.map(stage => this.getStageSpecificData(stage.id)));

        const participants = await this.storage.select('participant', { tournament_id: tournamentId });
        if (!participants) throw Error('Error getting participants.');

        return {
            stage: stages,
            group: stagesData.reduce((acc, data) => [...acc, ...data.groups], [] as Group[]),
            round: stagesData.reduce((acc, data) => [...acc, ...data.rounds], [] as Round[]),
            match: stagesData.reduce((acc, data) => [...acc, ...data.matches], [] as Match[]),
            match_game: stagesData.reduce((acc, data) => [...acc, ...data.matchGames], [] as MatchGame[]),
            participant: participants,
        };
    }

    /**
     * Returns the match games associated to a list of matches.
     *
     * @param matches A list of matches.
     */
    public async matchGames(matches: Match[]): Promise<MatchGame[]> {
        const parentMatches = matches.filter(match => match.child_count > 0);

        const matchGamesQueries = await Promise.all(parentMatches.map(match => this.storage.select('match_game', { parent_id: match.id })));
        if (matchGamesQueries.some(game => game === null)) throw Error('Error getting match games.');

        return helpers.getNonNull(matchGamesQueries).flat();
    }

    /**
     * Returns the seeding of a stage.
     *
     * @param stageId ID of the stage.
     */
    public async seeding(stageId: number): Promise<ParticipantSlot[]> {
        const stage = await this.storage.select('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        if (stage.type === 'round_robin')
            return this.roundRobinSeeding(stage);

        return this.eliminationSeeding(stage);
    }

    /**
     * Returns the final standings of a stage.
     *
     * @param stageId ID of the stage.
     */
    public async finalStandings(stageId: number): Promise<FinalStandingsItem[]> {
        const stage = await this.storage.select('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        switch (stage.type) {
            case 'round_robin':
                throw Error('A round-robin stage does not have standings.');
            case 'single_elimination':
                return this.singleEliminationStandings(stageId);
            case 'double_elimination':
                return this.doubleEliminationStandings(stageId);
            default:
                throw Error('Unknown stage type.');
        }
    }

    /**
     * Returns the seeding of a round-robin stage.
     *
     * @param stage The stage.
     */
    private async roundRobinSeeding(stage: Stage): Promise<ParticipantSlot[]> {
        if (stage.settings.size === undefined)
            throw Error('The size of the seeding is undefined.');

        const matches = await this.storage.select('match', { stage_id: stage.id });
        if (!matches) throw Error('Error getting matches.');

        const slots = helpers.matchesToSeeding(matches);

        // BYE vs. BYE matches of a round-robin stage are removed
        // when the stage is created. We need to add them back temporarily.
        if (slots.length < stage.settings.size) {
            const diff = stage.settings.size - slots.length;
            for (let i = 0; i < diff; i++)
                slots.push(null);
        }

        const unique = helpers.uniqueBy(slots, item => item && item.position);
        const seeding = helpers.setArraySize(unique, stage.settings.size, null);
        return seeding;
    }

    /**
     * Returns the seeding of an elimination stage.
     *
     * @param stage The stage.
     */
    private async eliminationSeeding(stage: Stage): Promise<ParticipantSlot[]> {
        const round = await this.storage.selectFirst('round', { stage_id: stage.id, number: 1 });
        if (!round) throw Error('Error getting the first round.');

        const matches = await this.storage.select('match', { round_id: round.id });
        if (!matches) throw Error('Error getting matches.');

        return helpers.matchesToSeeding(matches);
    }

    /**
     * Returns the final standings of a single elimination stage.
     *
     * @param stageId ID of the stage.
     */
    private async singleEliminationStandings(stageId: number): Promise<FinalStandingsItem[]> {
        const grouped: Participant[][] = [];

        const { stage: stages, group: groups, match: matches, participant: participants } = await this.stageData(stageId);

        const [stage] = stages;
        const [singleBracket, finalGroup] = groups;

        const final = matches.filter(match => match.group_id === singleBracket.id).pop();
        if (!final) throw Error('Final not found.');

        // 1st place: Final winner.
        grouped[0] = [helpers.findParticipant(participants, helpers.getWinner(final))];

        // Rest: every loser in reverse order.
        const losers = helpers.getLosers(participants, matches.filter(match => match.group_id === singleBracket.id));
        grouped.push(...losers.reverse());

        if (stage.settings?.consolationFinal) {
            const consolationFinal = matches.filter(match => match.group_id === finalGroup.id).pop();
            if (!consolationFinal) throw Error('Consolation final not found.');

            // Overwrite semi-final losers with the consolation final results.
            grouped[2][0] = helpers.findParticipant(participants, helpers.getWinner(consolationFinal));
            grouped[2][1] = helpers.findParticipant(participants, helpers.getLoser(consolationFinal));
        }

        return helpers.makeFinalStandings(grouped);
    }

    /**
     * Returns the final standings of a double elimination stage.
     *
     * @param stageId ID of the stage.
     */
    private async doubleEliminationStandings(stageId: number): Promise<FinalStandingsItem[]> {
        const grouped: Participant[][] = [];

        const { stage: stages, group: groups, match: matches, participant: participants } = await this.stageData(stageId);

        const [stage] = stages;
        const [winnerBracket, loserBracket, finalGroup] = groups;

        if (stage.settings?.grandFinal === 'none') {
            const finalWB = matches.filter(match => match.group_id === winnerBracket.id).pop();
            if (!finalWB) throw Error('WB final not found.');

            const finalLB = matches.filter(match => match.group_id === loserBracket.id).pop();
            if (!finalLB) throw Error('LB final not found.');

            // 1st place: WB Final winner.
            grouped[0] = [helpers.findParticipant(participants, helpers.getWinner(finalWB))];

            // 2nd place: LB Final winner.
            grouped[1] = [helpers.findParticipant(participants, helpers.getWinner(finalLB))];
        } else {
            const grandFinalMatches = matches.filter(match => match.group_id === finalGroup.id);
            const decisiveMatch = helpers.getGrandFinalDecisiveMatch(stage.settings?.grandFinal || 'none', grandFinalMatches);

            // 1st place: Grand Final winner.
            grouped[0] = [helpers.findParticipant(participants, helpers.getWinner(decisiveMatch))];

            // 2nd place: Grand Final loser.
            grouped[1] = [helpers.findParticipant(participants, helpers.getLoser(decisiveMatch))];
        }

        // Rest: every loser in reverse order.
        const losers = helpers.getLosers(participants, matches.filter(match => match.group_id === loserBracket.id));
        grouped.push(...losers.reverse());

        return helpers.makeFinalStandings(grouped);
    }

    /**
     * Returns only the data specific to the given stage (without the participants).
     * 
     * @param stageId ID of the stage.
     */
    private async getStageSpecificData(stageId: number): Promise<{
        stage: Stage;
        groups: Group[];
        rounds: Round[];
        matches: Match[];
        matchGames: MatchGame[];
    }> {
        const stage = await this.storage.select('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        const groups = await this.storage.select('group', { stage_id: stageId });
        if (!groups) throw Error('Error getting groups.');

        const rounds = await this.storage.select('round', { stage_id: stageId });
        if (!rounds) throw Error('Error getting rounds.');

        const matches = await this.storage.select('match', { stage_id: stageId });
        if (!matches) throw Error('Error getting matches.');

        const matchGames = await this.matchGames(matches);

        return {
            stage,
            groups,
            rounds,
            matches,
            matchGames,
        };
    }
}

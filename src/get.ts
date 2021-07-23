import { Group, Match, MatchGame, Participant, Round, Stage } from 'brackets-model';
import { Database, FinalStandingsItem, ParticipantSlot, Storage } from './types';
import * as helpers from './helpers';

export class Get {

    private readonly storage: Storage;

    /**
     * Creates an instance of Get, which will handle retrieving information from the stage.
     *
     * @param storage The implementation of Storage.
     */
    constructor(storage: Storage) {
        this.storage = storage;
    }

    /**
     * Returns the data needed to display a stage.
     *
     * @param stageId ID of the stage.
     */
    public async stageData(stageId: number): Promise<Database> {
        const stage = await this.storage.select<Stage>('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        const groups = await this.storage.select<Group>('group', { stage_id: stageId });
        if (!groups) throw Error('Error getting groups.');

        const rounds = await this.storage.select<Round>('round', { stage_id: stageId });
        if (!rounds) throw Error('Error getting rounds.');

        const matches = await this.storage.select<Match>('match', { stage_id: stageId });
        if (!matches) throw Error('Error getting matches.');

        const participants = await this.storage.select<Participant>('participant', { tournament_id: stage.tournament_id });
        if (!participants) throw Error('Error getting participants.');

        const matchGames = await this.matchGames(matches);

        return {
            stage: [stage],
            group: groups,
            round: rounds,
            match: matches,
            match_game: matchGames,
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

        const matchGamesQueries = await Promise.all(parentMatches.map(match => this.storage.select<MatchGame>('match_game', { parent_id: match.id })));
        if (matchGamesQueries.some(game => game === null)) throw Error('Error getting match games.');

        // Use a TS type guard to exclude null from the query results type.
        const matchGames = matchGamesQueries.filter((queryResult): queryResult is MatchGame[] => queryResult !== null).flat();

        return matchGames;
    }

    /**
     * Returns the seeding of a stage.
     *
     * @param stageId ID of the stage.
     */
    public async seeding(stageId: number): Promise<ParticipantSlot[]> {
        const stage = await this.storage.select<Stage>('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        if (stage.type === 'round_robin')
            return this.roundRobinSeeding(stageId);

        return this.eliminationSeeding(stageId);
    }

    /**
     * Returns the final standings of a stage.
     *
     * @param stageId ID of the stage.
     */
    public async finalStandings(stageId: number): Promise<FinalStandingsItem[]> {
        const stage = await this.storage.select<Stage>('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        switch (stage.type) {
            case 'round_robin':
                throw Error('A round-robin stage does not have standings.');
            case 'single_elimination':
                return this.singleEliminationStandings(stageId);
            case 'double_elimination':
                return this.doubleEliminationStandings(stageId);
        }
    }

    /**
     * Returns the seeding of a round-robin stage.
     *
     * @param stageId ID of the stage.
     */
    private async roundRobinSeeding(stageId: number): Promise<ParticipantSlot[]> {
        const matches = await this.storage.select<Match>('match', { stage_id: stageId });
        if (!matches) throw Error('Error getting matches.');

        const slots = helpers.matchesToSeeding(matches);
        const seeding = helpers.uniqueBy(slots, item => item && item.position);

        return seeding;
    }

    /**
     * Returns the seeding of an elimination stage.
     *
     * @param stageId ID of the stage.
     */
    private async eliminationSeeding(stageId: number): Promise<ParticipantSlot[]> {
        const round = await this.storage.selectFirst<Round>('round', { stage_id: stageId, number: 1 });
        if (!round) throw Error('Error getting the first round.');

        const matches = await this.storage.select<Match>('match', { round_id: round.id });
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
}

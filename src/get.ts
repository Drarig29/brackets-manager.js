import { Stage, Group, Round, Match, MatchGame, Participant, Status, Id, RankingItem } from 'brackets-model';
import { Database, FinalStandingsItem, ParticipantSlot, type RoundRobinFinalStandingsItem, type RoundRobinFinalStandingsOptions } from './types';
import { BaseGetter } from './base/getter';
import * as helpers from './helpers';

export class Get extends BaseGetter {

    /**
     * Returns the data needed to display a stage.
     *
     * @param stageId ID of the stage.
     */
    public async stageData(stageId: Id): Promise<Database> {
        const stage = await this.storage.select('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        const stageData = await this.getStageSpecificData(stage.id);

        const participants = await this.storage.select('participant', { tournament_id: stage.tournament_id });
        if (!participants) throw Error('Error getting participants.');

        return {
            stage: [stage],
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
    public async tournamentData(tournamentId: Id): Promise<Database> {
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
     * Returns the stage that is not completed yet, because of uncompleted matches.
     * If all matches are completed in this tournament, there is no "current stage", so `null` is returned.
     * 
     * @param tournamentId ID of the tournament.
     */
    public async currentStage(tournamentId: Id): Promise<Stage | null> {
        const stages = await this.storage.select('stage', { tournament_id: tournamentId });
        if (!stages) throw Error('Error getting stages.');

        for (const stage of stages) {
            const matches = await this.storage.select('match', { stage_id: stage.id });
            if (!matches) throw Error('Error getting matches.');

            if (matches.every(match => match.status >= Status.Completed))
                continue;

            return stage;
        }

        return null;
    }

    /**
     * Returns the round that is not completed yet, because of uncompleted matches.
     * If all matches are completed in this stage of a tournament, there is no "current round", so `null` is returned.
     * 
     * Note: The consolation final of single elimination and the grand final of double elimination will be in a different `Group`.
     * 
     * @param stageId ID of the stage.
     * @example
     * If you don't know the stage id, you can first get the current stage.
     * ```js
     * const tournamentId = 3;
     * const currentStage = await manager.get.currentStage(tournamentId);
     * const currentRound = await manager.get.currentRound(currentStage.id);
     * ```
     */
    public async currentRound(stageId: Id): Promise<Round | null> {
        const matches = await this.storage.select('match', { stage_id: stageId });
        if (!matches) throw Error('Error getting matches.');

        const matchesByRound = helpers.splitBy(matches, 'round_id');

        for (const roundMatches of matchesByRound) {
            if (roundMatches.every(match => match.status >= Status.Completed))
                continue;

            const round = await this.storage.select('round', roundMatches[0].round_id);
            if (!round) throw Error('Round not found.');
            return round;
        }

        return null;
    }

    /**
     * Returns the matches that can currently be played in parallel.
     * If the stage doesn't contain any, an empty array is returned.
     * 
     * Note:
     * - Returned matches are ongoing (i.e. ready or running).
     * - Returned matches can be from different rounds.
     * 
     * @param stageId ID of the stage.
     * @example
     * If you don't know the stage id, you can first get the current stage.
     * ```js
     * const tournamentId = 3;
     * const currentStage = await manager.get.currentStage(tournamentId);
     * const currentMatches = await manager.get.currentMatches(currentStage.id);
     * ```
     */
    public async currentMatches(stageId: Id): Promise<Match[]> {
        const stage = await this.storage.select('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        // TODO: Implement this for all stage types.
        // - For round robin, 1 round per group can be played in parallel at their own pace.
        // - For double elimination, 1 round per bracket (upper and lower) can be played in parallel at their own pace.
        if (stage.type !== 'single_elimination')
            throw Error('Not implemented for round robin and double elimination. Ask if needed.');

        const matches = await this.storage.select('match', { stage_id: stageId });
        if (!matches) throw Error('Error getting matches.');

        const matchesByRound = helpers.splitBy(matches, 'round_id');
        const roundCount = helpers.getUpperBracketRoundCount(stage.settings.size!);

        // Save multiple queries for `round`.
        let currentRoundIndex = -1;

        const currentMatches: Match[] = [];

        for (const roundMatches of matchesByRound) {
            currentRoundIndex++;

            if (stage.settings.consolationFinal && currentRoundIndex === roundCount - 1) {
                const [final] = roundMatches;
                const [consolationFinal] = matchesByRound[currentRoundIndex + 1];

                const finals = [final, consolationFinal];
                if (finals.every(match => !helpers.isMatchOngoing(match)))
                    return currentMatches;

                return finals.filter(match => helpers.isMatchOngoing(match));
            }

            if (roundMatches.every(match => !helpers.isMatchOngoing(match)))
                continue;

            currentMatches.push(...roundMatches.filter(match => helpers.isMatchOngoing(match)));
        }

        return currentMatches;
    }

    /**
     * Returns the seeding of a stage.
     *
     * @param stageId ID of the stage.
     */
    public async seeding(stageId: Id): Promise<ParticipantSlot[]> {
        const stage = await this.storage.select('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        const pickRelevantProps = (slot: ParticipantSlot): ParticipantSlot => {
            if (slot === null) return null;
            const { id, position } = slot;
            return { id, position };
        };

        if (stage.type === 'round_robin')
            return (await this.roundRobinSeeding(stage)).map(pickRelevantProps);

        return (await this.eliminationSeeding(stage)).map(pickRelevantProps);
    }

    /**
     * Returns the final standings of an elimination stage.
     *
     * @param stageId ID of the stage.
     */
    public async finalStandings(stageId: Id): Promise<FinalStandingsItem[]>;
    /**
     * Returns the final standings of a round-robin stage with a ranking formula.
     *
     * @param stageId ID of the stage.
     * @param rankingFormula The formula to compute the points for the ranking.
     */
    public async finalStandings(stageId: Id, roundRobinOptions: RoundRobinFinalStandingsOptions): Promise<RankingItem[]>;
    // eslint-disable-next-line jsdoc/require-jsdoc
    public async finalStandings(stageId: Id, roundRobinOptions?: RoundRobinFinalStandingsOptions): Promise<FinalStandingsItem[] | RankingItem[]> {
        const stage = await this.storage.select('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        switch (stage.type) {
            case 'round_robin': {
                if (!roundRobinOptions)
                    throw Error('Round-robin options are required for round-robin stages.');

                return this.roundRobinStandings(stage, roundRobinOptions);
            }
            case 'single_elimination': {
                if (roundRobinOptions)
                    throw Error('Round-robin options are not supported for elimination stages.');

                return this.singleEliminationStandings(stage);
            }
            case 'double_elimination': {
                if (roundRobinOptions)
                    throw Error('Round-robin options are not supported for elimination stages.');

                return this.doubleEliminationStandings(stage);
            }
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

        const slots = helpers.convertMatchesToSeeding(matches);

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
        const firstRound = await this.storage.selectFirst('round', { stage_id: stage.id, number: 1 }, false);
        if (!firstRound) throw Error('Error getting the first round.');

        const matches = await this.storage.select('match', { round_id: firstRound.id });
        if (!matches) throw Error('Error getting matches.');

        return helpers.convertMatchesToSeeding(matches);
    }


    /**
     * Returns the final standings of a round-robin stage.
     *
     * @param stage The stage.
     * @param roundRobinOptions The options for the round-robin standings.
     */
    private async roundRobinStandings(stage: Stage, roundRobinOptions: RoundRobinFinalStandingsOptions): Promise<RoundRobinFinalStandingsItem[]> {
        const participants = await this.storage.select('participant', { tournament_id: stage.tournament_id });
        if (!participants) throw Error('Error getting participants.');

        const matches = await this.storage.select('match', { stage_id: stage.id });
        if (!matches) throw Error('Error getting matches.');

        const matchesByGroup = helpers.splitBy(matches, 'group_id');
        const unsortedRanking = matchesByGroup.flatMap(groupMatches => {
            const groupRanking = helpers.getRanking(groupMatches, roundRobinOptions.rankingFormula);
            const qualifiedOnly = groupRanking.slice(0, roundRobinOptions.maxQualifiedParticipantsPerGroup);
            return qualifiedOnly.map(item => ({
                ...item,
                groupId: groupMatches[0].group_id,
                name: helpers.findParticipant(participants, item).name,
            }));
        });

        return unsortedRanking.sort((a, b) => {
            // If the ranks are the same, sort by points.
            // Points are compared in reverse order to get the highest points first.
            if (a.rank === b.rank) return b.points - a.points;
            return a.rank - b.rank;
        });
    }

    /**
     * Returns the final standings of a single elimination stage.
     *
     * @param stage The stage.
     */
    private async singleEliminationStandings(stage: Stage): Promise<FinalStandingsItem[]> {
        const grouped: Participant[][] = [];

        const { group: groups, match: matches, participant: participants } = await this.stageData(stage.id);

        const [singleBracket, finalGroup] = groups;

        const final = matches.filter(match => match.group_id === singleBracket.id).pop();
        if (!final) throw Error('Final not found.');

        // 1st place: Final winner.
        grouped[0] = [helpers.findParticipant(participants, getFinalWinnerIfDefined(final))];

        // Rest: every loser in reverse order.
        const losers = helpers.getLosers(participants, matches.filter(match => match.group_id === singleBracket.id));
        grouped.push(...losers.reverse());

        if (stage.settings?.consolationFinal) {
            const consolationFinal = matches.filter(match => match.group_id === finalGroup.id).pop();
            if (!consolationFinal) throw Error('Consolation final not found.');

            const consolationFinalWinner = helpers.findParticipant(participants, getFinalWinnerIfDefined(consolationFinal));
            const consolationFinalLoser = helpers.findParticipant(participants, helpers.getLoser(consolationFinal));

            // Overwrite semi-final losers with the consolation final results.
            grouped.splice(2, 1, [consolationFinalWinner], [consolationFinalLoser]);
        }

        return helpers.makeFinalStandings(grouped);
    }

    /**
     * Returns the final standings of a double elimination stage.
     *
     * @param stage The stage.
     */
    private async doubleEliminationStandings(stage: Stage): Promise<FinalStandingsItem[]> {
        const grouped: Participant[][] = [];

        const { group: groups, match: matches, participant: participants } = await this.stageData(stage.id);

        const [winnerBracket, loserBracket, finalGroup] = groups;

        if (stage.settings?.grandFinal === 'none') {
            const finalWB = matches.filter(match => match.group_id === winnerBracket.id).pop();
            if (!finalWB) throw Error('WB final not found.');

            const finalLB = matches.filter(match => match.group_id === loserBracket.id).pop();
            if (!finalLB) throw Error('LB final not found.');

            // 1st place: WB Final winner.
            grouped[0] = [helpers.findParticipant(participants, getFinalWinnerIfDefined(finalWB))];

            // 2nd place: LB Final winner.
            grouped[1] = [helpers.findParticipant(participants, getFinalWinnerIfDefined(finalLB))];
        } else {
            const grandFinalMatches = matches.filter(match => match.group_id === finalGroup.id);
            const decisiveMatch = helpers.getGrandFinalDecisiveMatch(stage.settings?.grandFinal || 'none', grandFinalMatches);

            // 1st place: Grand Final winner.
            grouped[0] = [helpers.findParticipant(participants, getFinalWinnerIfDefined(decisiveMatch))];

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
    private async getStageSpecificData(stageId: Id): Promise<{
        groups: Group[];
        rounds: Round[];
        matches: Match[];
        matchGames: MatchGame[];
    }> {
        const groups = await this.storage.select('group', { stage_id: stageId });
        if (!groups) throw Error('Error getting groups.');

        const rounds = await this.storage.select('round', { stage_id: stageId });
        if (!rounds) throw Error('Error getting rounds.');

        const matches = await this.storage.select('match', { stage_id: stageId });
        if (!matches) throw Error('Error getting matches.');

        const matchGames = await this.matchGames(matches);

        return {
            groups,
            rounds,
            matches,
            matchGames,
        };
    }
}

const getFinalWinnerIfDefined = (match: Match): ParticipantSlot => {
    const winner = helpers.getWinner(match);
    if (!winner) throw Error('The final match does not have a winner.');
    return winner;
};

import { Group, Id, Match, MatchGame } from 'brackets-model';
import { BaseGetter } from './base/getter';
import * as helpers from './helpers';

export class Find extends BaseGetter {

    /**
     * Gets the upper bracket (the only bracket if single elimination or the winner bracket in double elimination).
     *
     * @param stageId ID of the stage.
     */
    public async upperBracket(stageId: Id): Promise<Group> {
        const stage = await this.storage.select('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        switch (stage.type) {
            case 'round_robin':
                throw Error('Round-robin stages do not have an upper bracket.');
            case 'single_elimination':
            case 'double_elimination':
                return this.getUpperBracket(stageId);
            default:
                throw Error('Unknown stage type.');
        }
    }

    /**
     * Gets the loser bracket.
     *
     * @param stageId ID of the stage.
     */
    public async loserBracket(stageId: Id): Promise<Group> {
        const stage = await this.storage.select('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        switch (stage.type) {
            case 'round_robin':
                throw Error('Round-robin stages do not have a loser bracket.');
            case 'single_elimination':
                throw Error('Single elimination stages do not have a loser bracket.');
            case 'double_elimination':
                const group = await this.getLoserBracket(stageId);
                if (!group) throw Error('Loser bracket not found.');
                return group;
            default:
                throw Error('Unknown stage type.');
        }
    }

    /**
     * Returns the matches leading to the given match.
     * 
     * If a `participantId` is given, the previous match _from their point of view_ is returned.
     * 
     * @param matchId ID of the target match.
     * @param participantId Optional ID of the participant.
     */
    public async previousMatches(matchId: Id, participantId?: number): Promise<Match[]> {
        const match = await this.storage.select('match', matchId);
        if (!match) throw Error('Match not found.');

        const stage = await this.storage.select('stage', match.stage_id);
        if (!stage) throw Error('Stage not found.');

        const group = await this.storage.select('group', match.group_id);
        if (!group) throw Error('Group not found.');

        const round = await this.storage.select('round', match.round_id);
        if (!round) throw Error('Round not found.');

        const matchLocation = helpers.getMatchLocation(stage.type, group.number);
        const previousMatches = await this.getPreviousMatches(match, matchLocation, stage, round.number);

        if (participantId !== undefined)
            return previousMatches.filter(m => helpers.isParticipantInMatch(m, participantId));

        return previousMatches;
    }

    /**
     * Returns the matches following the given match.
     * 
     * If a `participantId` is given:
     * - If the participant won, the next match _from their point of view_ is returned.
     * - If the participant is eliminated, no match is returned.
     * 
     * @param matchId ID of the target match.
     * @param participantId Optional ID of the participant.
     */
    public async nextMatches(matchId: Id, participantId?: number): Promise<Match[]> {
        const match = await this.storage.select('match', matchId);
        if (!match) throw Error('Match not found.');

        const stage = await this.storage.select('stage', match.stage_id);
        if (!stage) throw Error('Stage not found.');

        const group = await this.storage.select('group', match.group_id);
        if (!group) throw Error('Group not found.');

        const { roundNumber, roundCount } = await this.getRoundPositionalInfo(match.round_id);
        const matchLocation = helpers.getMatchLocation(stage.type, group.number);

        const nextMatches = helpers.getNonNull(
            await this.getNextMatches(match, matchLocation, stage, roundNumber, roundCount),
        );

        if (participantId !== undefined) {
            if (!helpers.isParticipantInMatch(match, participantId))
                throw Error('The participant does not belong to this match.');

            if (!helpers.isMatchStale(match))
                throw Error('The match is not stale yet, so it is not possible to conclude the next matches for this participant.');

            const loser = helpers.getLoser(match);
            if (stage.type === 'single_elimination' && loser?.id === participantId)
                return []; // Eliminated.

            if (stage.type === 'double_elimination') {
                // TODO: refactor `getNextMatches()` to return 1 next match per group. Then we can get rid of `getMatchesByGroupDoubleElimination()`.
                const { winnerBracketMatch, loserBracketMatch, finalGroupMatch } = await this.getMatchesByGroupDoubleElimination(nextMatches, new Map([[group.id, group]]));
                const winner = helpers.getWinner(match);

                if (matchLocation === 'loser_bracket') {
                    if (participantId === loser?.id)
                        return []; // Eliminated from lower bracket.

                    if (participantId === winner?.id)
                        return loserBracketMatch ? [loserBracketMatch] : [];
                } else if (matchLocation === 'winner_bracket') {
                    if (!loserBracketMatch)
                        throw Error('All matches of winner bracket should lead to loser bracket.');

                    if (participantId === loser?.id)
                        return [loserBracketMatch]; // Eliminated from upper bracket, going to lower bracket.

                    if (participantId === winner?.id)
                        return winnerBracketMatch ? [winnerBracketMatch] : [];
                } else if (matchLocation === 'final_group') {
                    if (!finalGroupMatch)
                        throw Error('All matches of a final group should also lead to the final group.');

                    return [finalGroupMatch];
                }
            }
        }

        return nextMatches;
    }

    /**
     * Finds a match in a given group. The match must have the given number in a round of which the number in group is given.
     *
     * **Example:** In group of id 1, give me the 4th match in the 3rd round.
     *
     * @param groupId ID of the group.
     * @param roundNumber Number of the round in its parent group.
     * @param matchNumber Number of the match in its parent round.
     */
    public async match(groupId: Id, roundNumber: number, matchNumber: number): Promise<Match> {
        return this.findMatch(groupId, roundNumber, matchNumber);
    }

    /**
     * Finds a match game based on its `id` or based on the combination of its `parent_id` and `number`.
     * 
     * @param game Values to change in a match game.
     */
    public async matchGame(game: Partial<MatchGame>): Promise<MatchGame> {
        return this.findMatchGame(game);
    }

    /**
     * Returns an object with 1 match per group type. Only supports double elimination.
     *
     * @param matches A list of matches.
     * @param fetchedGroups A map of groups which were already fetched.
     */
    private async getMatchesByGroupDoubleElimination(matches: Match[], fetchedGroups: Map<Id, Group>): Promise<{
        winnerBracketMatch?: Match;
        loserBracketMatch?: Match;
        finalGroupMatch?: Match;
    }> {
        const getGroup = async (groupId: Id): Promise<Group> => {
            const existing = fetchedGroups.get(groupId);
            if (existing)
                return existing;

            const group = await this.storage.select('group', groupId);
            if (!group) throw Error('Group not found.');
            fetchedGroups.set(groupId, group);
            return group;
        };

        let matchByGroupType: {
            winnerBracketMatch?: Match
            loserBracketMatch?: Match
            finalGroupMatch?: Match
        } = {};

        for (const match of matches) {
            const group = await getGroup(match.group_id);

            matchByGroupType = {
                winnerBracketMatch: matchByGroupType['winnerBracketMatch'] ?? (helpers.isWinnerBracket('double_elimination', group.number) ? match : undefined),
                loserBracketMatch: matchByGroupType['loserBracketMatch'] ?? (helpers.isLoserBracket('double_elimination', group.number) ? match : undefined),
                finalGroupMatch: matchByGroupType['finalGroupMatch'] ?? (helpers.isFinalGroup('double_elimination', group.number) ? match : undefined),
            };
        }

        return matchByGroupType;
    }
}

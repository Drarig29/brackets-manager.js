import { Group, Match, MatchGame } from 'brackets-model';
import { BaseGetter } from './base/getter';
import * as helpers from './helpers';

export class Find extends BaseGetter {

    /**
     * Gets the upper bracket (the only bracket if single elimination or the winner bracket in double elimination).
     *
     * @param stageId ID of the stage.
     */
    public async upperBracket(stageId: number): Promise<Group> {
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
    public async loserBracket(stageId: number): Promise<Group> {
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
    public async previousMatches(matchId: number, participantId?: number): Promise<Match[]> {
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
    public async nextMatches(matchId: number, participantId?: number): Promise<Match[]> {
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
            const loser = helpers.getLoser(match);
            if (stage.type === 'single_elimination' && loser?.id === participantId)
                return []; // Eliminated.

            if (stage.type === 'double_elimination') {
                const [upperBracketMatch, lowerBracketMatch] = nextMatches;

                if (loser?.id === participantId) {
                    if (lowerBracketMatch)
                        return [lowerBracketMatch];
                    else
                        return []; // Eliminated from lower bracket.
                }

                const winner = helpers.getWinner(match);
                if (winner?.id === participantId)
                    return [upperBracketMatch];

                throw Error('The participant does not belong to this match.');
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
    public async match(groupId: number, roundNumber: number, matchNumber: number): Promise<Match> {
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
}

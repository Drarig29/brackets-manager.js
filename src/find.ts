import { Group, Match, MatchGame, Round, Stage } from 'brackets-model';
import { BaseGetter } from './base/getter';
import * as helpers from './helpers';

export class Find extends BaseGetter {

    /**
     * Gets the upper bracket (the only bracket if single elimination or the winner bracket in double elimination).
     *
     * @param stageId ID of the stage.
     */
    public async getUpperBracket(stageId: number): Promise<Group> {
        const stage = await this.storage.select<Stage>('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        switch (stage.type) {
            case 'round_robin':
                throw Error('Round robin stages do not have an upper bracket.');
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
    public async getLoserBracket(stageId: number): Promise<Group> {
        const stage = await this.storage.select<Stage>('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        switch (stage.type) {
            case 'round_robin':
                throw Error('Round robin stages do not have a loser bracket.');
            case 'single_elimination':
                throw Error('Single elimination stages do not have a loser bracket.');
            case 'double_elimination':
                this.getLoserBracket(stageId);
            default:
                throw Error('Unknown stage type.');
        }
    }

    /**
     * Returns the matches leading to the given match.
     * 
     * @param matchId ID of the target match.
     */
    public async previousMatches(matchId: number): Promise<Match[]> {
        const match = await this.storage.select<Match>('match', matchId);
        if (!match) throw Error('Match not found.');

        const stage = await this.storage.select<Stage>('stage', match.stage_id);
        if (!stage) throw Error('Stage not found.');

        const group = await this.storage.select<Group>('group', match.group_id);
        if (!group) throw Error('Group not found.');

        const round = await this.storage.select<Round>('round', match.round_id);
        if (!round) throw Error('Round not found.');

        const matchLocation = helpers.getMatchLocation(stage.type, group.number);

        return this.getPreviousMatches(match, matchLocation, stage, round.number);
    }

    /**
     * Returns the matches following the given match.
     * 
     * @param matchId ID of the target match.
     */
    public async nextMatches(matchId: number): Promise<Match[]> {
        const match = await this.storage.select<Match>('match', matchId);
        if (!match) throw Error('Match not found.');

        const stage = await this.storage.select<Stage>('stage', match.stage_id);
        if (!stage) throw Error('Stage not found.');

        const group = await this.storage.select<Group>('group', match.group_id);
        if (!group) throw Error('Group not found.');

        const { roundNumber, roundCount } = await this.getRoundPositionalInfo(match.round_id);
        const matchLocation = helpers.getMatchLocation(stage.type, group.number);

        const nextMatches = await this.getNextMatches(match, matchLocation, stage, roundNumber, roundCount);
        return helpers.getNonNull(nextMatches);
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
    public async findMatch(groupId: number, roundNumber: number, matchNumber: number): Promise<Match> {
        return this.findMatch(groupId, roundNumber, matchNumber);
    }

    /**
     * Finds a match game based on its `id` or based on the combination of its `parent_id` and `number`.
     * 
     * @param game Values to change in a match game.
     */
    protected async findMatchGame(game: Partial<MatchGame>): Promise<MatchGame> {
        return this.findMatchGame(game);
    }
}

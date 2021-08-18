import { Group, Match, MatchGame, Stage } from 'brackets-model';
import { BaseGetter } from './base/getter';

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

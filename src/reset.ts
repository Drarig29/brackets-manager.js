import { Group, Match, MatchGame, Stage, Status } from 'brackets-model';
import { BaseUpdater } from './update';
import * as helpers from './helpers';

export class Reset extends BaseUpdater {

    /**
     * Resets the results of a match.
     *
     * This will update related matches accordingly.
     *
     * @param matchId ID of the match.
     */
    public async matchResults(matchId: number): Promise<void> {
        const stored = await this.storage.select<Match>('match', matchId);
        if (!stored) throw Error('Match not found.');

        if (stored.child_count > 0)
            throw Error('The parent match is controlled by its child games and its result cannot be reset.');

        const stage = await this.storage.select<Stage>('stage', stored.stage_id);
        if (!stage) throw Error('Stage not found.');

        const group = await this.storage.select<Group>('group', stored.group_id);
        if (!group) throw Error('Group not found.');

        const { roundNumber, roundCount } = await this.getRoundInfos(stored.group_id, stored.round_id);
        const matchLocation = helpers.getMatchLocation(stage.type, group.number);
        const nextMatches = await this.getNextMatches(stored, matchLocation, stage, roundNumber, roundCount);

        if (nextMatches.some(match => match && match.status >= Status.Running && !helpers.isMatchByeCompleted(match)))
            throw Error('The match is locked.');

        helpers.resetMatchResults(stored);
        await this.applyMatchUpdate(stored);

        if (!helpers.isRoundRobin(stage))
            await this.updateRelatedMatches(stored, true, true);
    }

    /**
     * Resets the results of a match game.
     *
     * @param gameId ID of the match game.
     */
    public async matchGameResults(gameId: number): Promise<void> {
        const stored = await this.storage.select<MatchGame>('match_game', gameId);
        if (!stored) throw Error('Match game not found.');

        helpers.resetMatchResults(stored);
        await this.storage.update('match_game', stored.id, stored);

        await this.updateParentMatch(stored.parent_id);
    }

    /**
     * Resets the seeding of a stage.
     *
     * @param stageId ID of the stage.
     */
    public async seeding(stageId: number): Promise<void> {
        await this.updateSeeding(stageId, null);
    }
}

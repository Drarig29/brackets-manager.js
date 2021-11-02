import { Match, MatchGame, Round, Seeding, SeedOrdering, Status } from 'brackets-model';
import { ordering } from './ordering';
import { BaseUpdater } from './base/updater';
import { ChildCountLevel } from './types';
import * as helpers from './helpers';

export class Update extends BaseUpdater {

    /**
     * Updates partial information of a match. Its id must be given.
     *
     * This will update related matches accordingly.
     *
     * @param match Values to change in a match.
     */
    public async match(match: Partial<Match>): Promise<void> {
        if (match.id === undefined)
            throw Error('No match id given.');

        const stored = await this.storage.select('match', match.id);
        if (!stored) throw Error('Match not found.');

        await this.updateMatch(stored, match);
    }

    /**
     * Updates partial information of a match game. Its id must be given.
     *
     * This will update the parent match accordingly.
     *
     * @param game Values to change in a match game.
     */
    public async matchGame(game: Partial<MatchGame>): Promise<void> {
        const stored = await this.findMatchGame(game);

        if (helpers.isMatchUpdateLocked(stored))
            throw Error('The match game is locked.');

        helpers.setMatchResults(stored, game);

        if (!await this.storage.update('match_game', stored.id, stored))
            throw Error('Could not update the match game.');

        await this.updateParentMatch(stored.parent_id);
    }

    /**
     * Updates the seed ordering of every ordered round in a stage.
     *
     * @param stageId ID of the stage.
     * @param seedOrdering A list of ordering methods.
     */
    public async ordering(stageId: number, seedOrdering: SeedOrdering[]): Promise<void> {
        const stage = await this.storage.select('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        helpers.ensureNotRoundRobin(stage);

        const roundsToOrder = await this.getOrderedRounds(stage);
        if (seedOrdering.length !== roundsToOrder.length)
            throw Error('The count of seed orderings is incorrect.');

        for (let i = 0; i < roundsToOrder.length; i++)
            await this.updateRoundOrdering(roundsToOrder[i], seedOrdering[i]);
    }

    /**
     * Updates the seed ordering of a round.
     *
     * @param roundId ID of the round.
     * @param method Seed ordering method.
     */
    public async roundOrdering(roundId: number, method: SeedOrdering): Promise<void> {
        const round = await this.storage.select('round', roundId);
        if (!round) throw Error('This round does not exist.');

        const stage = await this.storage.select('stage', round.stage_id);
        if (!stage) throw Error('Stage not found.');

        helpers.ensureNotRoundRobin(stage);

        await this.updateRoundOrdering(round, method);
    }

    /**
     * Updates child count of all matches of a given level.
     *
     * @param level The level at which to act.
     * @param id ID of the chosen level.
     * @param childCount The target child count.
     */
    public async matchChildCount(level: ChildCountLevel, id: number, childCount: number): Promise<void> {
        switch (level) {
            case 'stage':
                await this.updateStageMatchChildCount(id, childCount);
                break;
            case 'group':
                await this.updateGroupMatchChildCount(id, childCount);
                break;
            case 'round':
                await this.updateRoundMatchChildCount(id, childCount);
                break;
            case 'match':
                const match = await this.storage.select('match', id);
                if (!match) throw Error('Match not found.');
                await this.adjustMatchChildGames(match, childCount);
                break;
            default:
                throw Error('Unknown child count level.');
        }
    }

    /**
     * Updates the seeding of a stage.
     *
     * @param stageId ID of the stage.
     * @param seeding The new seeding.
     */
    public async seeding(stageId: number, seeding: Seeding): Promise<void> {
        await this.updateSeeding(stageId, seeding);
    }

    /**
     * Update the seed ordering of a round.
     *
     * @param round The round of which to update the ordering.
     * @param method The new ordering method.
     */
    private async updateRoundOrdering(round: Round, method: SeedOrdering): Promise<void> {
        const matches = await this.storage.select('match', { round_id: round.id });
        if (!matches) throw Error('This round has no match.');

        if (matches.some(match => match.status > Status.Ready))
            throw Error('At least one match has started or is completed.');

        const stage = await this.storage.select('stage', round.stage_id);
        if (!stage) throw Error('Stage not found.');
        if (stage.settings.size === undefined) throw Error('Undefined stage size.');

        const group = await this.storage.select('group', round.group_id);
        if (!group) throw Error('Group not found.');

        const inLoserBracket = helpers.isLoserBracket(stage.type, group.number);
        const roundCountLB = helpers.getLowerBracketRoundCount(stage.settings.size);
        const seeds = helpers.getSeeds(inLoserBracket, round.number, roundCountLB, matches.length);
        const positions = ordering[method](seeds);

        await this.applyRoundOrdering(round.number, matches, positions);
    }

    /**
     * Updates child count of all matches of a stage.
     *
     * @param stageId ID of the stage.
     * @param childCount The target child count.
     */
    private async updateStageMatchChildCount(stageId: number, childCount: number): Promise<void> {
        if (!await this.storage.update('match', { stage_id: stageId }, { child_count: childCount }))
            throw Error('Could not update the match.');

        const matches = await this.storage.select('match', { stage_id: stageId });
        if (!matches) throw Error('This stage has no match.');

        for (const match of matches)
            await this.adjustMatchChildGames(match, childCount);
    }

    /**
     * Updates child count of all matches of a group.
     *
     * @param groupId ID of the group.
     * @param childCount The target child count.
     */
    private async updateGroupMatchChildCount(groupId: number, childCount: number): Promise<void> {
        if (!await this.storage.update('match', { group_id: groupId }, { child_count: childCount }))
            throw Error('Could not update the match.');

        const matches = await this.storage.select('match', { group_id: groupId });
        if (!matches) throw Error('This group has no match.');

        for (const match of matches)
            await this.adjustMatchChildGames(match, childCount);
    }

    /**
     * Updates child count of all matches of a round.
     *
     * @param roundId ID of the round.
     * @param childCount The target child count.
     */
    private async updateRoundMatchChildCount(roundId: number, childCount: number): Promise<void> {
        if (!await this.storage.update('match', { round_id: roundId }, { child_count: childCount }))
            throw Error('Could not update the match.');

        const matches = await this.storage.select('match', { round_id: roundId });
        if (!matches) throw Error('This round has no match.');

        for (const match of matches)
            await this.adjustMatchChildGames(match, childCount);
    }

    /**
     * Updates the ordering of participants in a round's matches.
     *
     * @param roundNumber The number of the round.
     * @param matches The matches of the round.
     * @param positions The new positions.
     */
    private async applyRoundOrdering(roundNumber: number, matches: Match[], positions: number[]): Promise<void> {
        for (const match of matches) {
            const updated = { ...match };
            updated.opponent1 = helpers.findPosition(matches, positions.shift()!);

            // The only rounds where we have a second ordered participant are first rounds of brackets (upper and lower).
            if (roundNumber === 1)
                updated.opponent2 = helpers.findPosition(matches, positions.shift()!);

            if (!await this.storage.update('match', updated.id, updated))
                throw Error('Could not update the match.');
        }
    }

    /**
     * Adds or deletes match games of a match based on a target child count.
     *
     * @param match The match of which child games need to be adjusted.
     * @param targetChildCount The target child count.
     */
    private async adjustMatchChildGames(match: Match, targetChildCount: number): Promise<void> {
        const games = await this.storage.select('match_game', { parent_id: match.id });
        let childCount = games ? games.length : 0;

        while (childCount < targetChildCount) {
            const id = await this.storage.insert('match_game', {
                number: childCount + 1,
                stage_id: match.stage_id,
                parent_id: match.id,
                status: match.status,
                opponent1: { id: null },
                opponent2: { id: null },
            });

            if (id === -1)
                throw Error('Could not adjust the match games when inserting.');

            childCount++;
        }

        while (childCount > targetChildCount) {
            const deleted = await this.storage.delete('match_game', {
                parent_id: match.id,
                number: childCount,
            });

            if (!deleted)
                throw Error('Could not adjust the match games when deleting.');

            childCount--;
        }

        if (!await this.storage.update('match', match.id, { ...match, child_count: targetChildCount }))
            throw Error('Could not update the match.');
    }
}

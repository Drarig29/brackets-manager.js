import { Match, MatchGame, Seeding, Stage, Status, GroupType, Id, IdSeeding } from 'brackets-model';
import { DeepPartial, ParticipantSlot, Side } from '../types';
import { SetNextOpponent } from '../helpers';
import { ordering } from '../ordering';
import { StageCreator } from './stage/creator';
import { BaseGetter } from './getter';
import { Get } from '../get';
import * as helpers from '../helpers';

export class BaseUpdater extends BaseGetter {

    /**
     * Updates or resets the seeding of a stage.
     *
     * @param stageId ID of the stage.
     * @param seeding A new seeding or `null` to reset the existing seeding.
     * @param seeding.seeding Can contain names, IDs or BYEs.
     * @param seeding.seedingIds Can only contain IDs or BYEs.
     * @param keepSameSize Whether to keep the same size as before for the stage.
     */
    protected async updateSeeding(stageId: Id, { seeding, seedingIds }: { seeding?: Seeding | null, seedingIds?: IdSeeding | null }, keepSameSize: boolean): Promise<void> {
        const stage = await this.storage.select('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        const newSize = keepSameSize ? stage.settings.size : (seedingIds || seeding)?.length ?? 0;

        const creator = new StageCreator(this.storage, {
            name: stage.name,
            tournamentId: stage.tournament_id,
            type: stage.type,
            settings: {
                ...stage.settings,
                ...(newSize === 0 ? {} : { size: newSize }), // Just reset the seeding if the new size is going to be empty.
            },
            ...((seedingIds ? { seedingIds } : { seeding: seeding ?? undefined })),
        });

        creator.setExisting(stageId, false);

        const method = BaseGetter.getSeedingOrdering(stage.type, creator);
        const slots = await creator.getSlots();

        const matches = await this.getSeedingMatches(stage.id, stage.type);
        if (!matches)
            throw Error('Error getting matches associated to the seeding.');

        const ordered = ordering[method](slots);
        BaseUpdater.assertCanUpdateSeeding(matches, ordered);

        await creator.run();
    }

    /**
     * Confirms the current seeding of a stage.
     *
     * @param stageId ID of the stage.
     */
    protected async confirmCurrentSeeding(stageId: Id): Promise<void> {
        const stage = await this.storage.select('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        const get = new Get(this.storage);
        const currentSeeding = await get.seeding(stageId);
        const newSeeding = helpers.convertSlotsToSeeding(currentSeeding.map(helpers.convertTBDtoBYE));

        const creator = new StageCreator(this.storage, {
            name: stage.name,
            tournamentId: stage.tournament_id,
            type: stage.type,
            settings: stage.settings,
            seeding: newSeeding,
        });

        creator.setExisting(stageId, true);

        await creator.run();
    }

    /**
     * Updates a parent match based on its child games.
     * 
     * @param parentId ID of the parent match.
     * @param inRoundRobin Indicates whether the parent match is in a round-robin stage.
     */
    protected async updateParentMatch(parentId: Id, inRoundRobin: boolean): Promise<void> {
        const storedParent = await this.storage.select('match', parentId);
        if (!storedParent) throw Error('Parent not found.');

        const games = await this.storage.select('match_game', { parent_id: parentId });
        if (!games) throw Error('No match games.');

        const parentScores = helpers.getChildGamesResults(games);
        const parent = helpers.getParentMatchResults(storedParent, parentScores);

        helpers.setParentMatchCompleted(parent, storedParent.child_count, inRoundRobin);

        await this.updateMatch(storedParent, parent, true);
    }

    /**
     * Throws an error if a match is locked and the new seeding will change this match's participants.
     *
     * @param matches The matches stored in the database.
     * @param slots The slots to check from the new seeding.
     */
    protected static assertCanUpdateSeeding(matches: Match[], slots: ParticipantSlot[]): void {
        let index = 0;

        for (const match of matches) {
            // Changing the seeding would reset the matches of round >= 2, leaving the scores behind, with no participants.
            if (match.status === Status.Archived)
                throw Error('A match of round 1 is archived, which means round 2 was started.');

            const opponent1 = slots[index++];
            const opponent2 = slots[index++];
            const isParticipantLocked = helpers.isMatchParticipantLocked(match);

            // The match is participant locked, and the participants would have to change.
            if (isParticipantLocked && (match.opponent1?.id !== opponent1?.id || match.opponent2?.id !== opponent2?.id))
                throw Error('A match is locked.');
        }
    }

    /**
     * Updates the matches related (previous and next) to a match.
     *
     * @param match A match.
     * @param updatePrevious Whether to update the previous matches.
     * @param updateNext Whether to update the next matches.
     */
    protected async updateRelatedMatches(match: Match, updatePrevious: boolean, updateNext: boolean): Promise<void> {
        // This is a consolation match (doesn't have a `group_id`, nor a `round_id`).
        // It doesn't have any related matches from the POV of the library, because the 
        // creation of consolation matches is handled by the user.
        if (match.round_id === undefined)
            return;

        const { roundNumber, roundCount } = await this.getRoundPositionalInfo(match.round_id);

        const stage = await this.storage.select('stage', match.stage_id);
        if (!stage) throw Error('Stage not found.');

        const group = await this.storage.select('group', match.group_id);
        if (!group) throw Error('Group not found.');

        const matchLocation = helpers.getMatchLocation(stage.type, group.number);

        updatePrevious && await this.updatePrevious(match, matchLocation, stage, roundNumber);
        updateNext && await this.updateNext(match, matchLocation, stage, roundNumber, roundCount);
    }

    /**
     * Updates a match based on a partial match.
     * 
     * @param stored A reference to what will be updated in the storage.
     * @param match Input of the update.
     * @param force Whether to force update locked matches.
     */
    protected async updateMatch(stored: Match, match: DeepPartial<Match>, force?: boolean): Promise<void> {
        if (!force && helpers.isMatchUpdateLocked(stored))
            throw Error('The match is locked.');

        const stage = await this.storage.select('stage', stored.stage_id);
        if (!stage) throw Error('Stage not found.');

        const inRoundRobin = helpers.isRoundRobin(stage);

        const { statusChanged, resultChanged } = helpers.setMatchResults(stored, match, inRoundRobin);
        await this.applyMatchUpdate(stored);

        // Don't update related matches if it's a simple score update.
        if (!statusChanged && !resultChanged) return;

        if (!helpers.isRoundRobin(stage))
            await this.updateRelatedMatches(stored, statusChanged, resultChanged);
    }

    /**
     * Updates a match game based on a partial match game.
     * 
     * @param stored A reference to what will be updated in the storage.
     * @param game Input of the update.
     */
    protected async updateMatchGame(stored: MatchGame, game: DeepPartial<MatchGame>): Promise<void> {
        if (helpers.isMatchUpdateLocked(stored))
            throw Error('The match game is locked.');

        const stage = await this.storage.select('stage', stored.stage_id);
        if (!stage) throw Error('Stage not found.');

        const inRoundRobin = helpers.isRoundRobin(stage);

        helpers.setMatchResults(stored, game, inRoundRobin);

        if (!await this.storage.update('match_game', stored.id, stored))
            throw Error('Could not update the match game.');

        await this.updateParentMatch(stored.parent_id, inRoundRobin);
    }

    /**
     * Updates the opponents and status of a match and its child games.
     *
     * @param match A match.
     */
    protected async applyMatchUpdate(match: Match): Promise<void> {
        if (!await this.storage.update('match', match.id, match))
            throw Error('Could not update the match.');

        if (match.child_count === 0) return;

        const updatedMatchGame: Partial<MatchGame> = {
            opponent1: helpers.toResult(match.opponent1),
            opponent2: helpers.toResult(match.opponent2),
        };

        // Only sync the child games' status with their parent's status when changing the parent match participants
        // (Locked, Waiting, Ready) or when archiving the parent match.
        if (match.status <= Status.Ready || match.status === Status.Archived)
            updatedMatchGame.status = match.status;

        if (!await this.storage.update('match_game', { parent_id: match.id }, updatedMatchGame))
            throw Error('Could not update the match game.');
    }

    /**
     * Updates the match(es) leading to the current match based on this match results.
     *
     * @param match Input of the update.
     * @param matchLocation Location of the current match.
     * @param stage The parent stage.
     * @param roundNumber Number of the round.
     */
    protected async updatePrevious(match: Match, matchLocation: GroupType, stage: Stage, roundNumber: number): Promise<void> {
        const previousMatches = await this.getPreviousMatches(match, matchLocation, stage, roundNumber);
        if (previousMatches.length === 0) return;

        if (match.status >= Status.Running)
            await this.archiveMatches(previousMatches);
        else
            await this.resetMatchesStatus(previousMatches);
    }

    /**
     * Sets the status of a list of matches to archived.
     *
     * @param matches The matches to update.
     */
    protected async archiveMatches(matches: Match[]): Promise<void> {
        for (const match of matches) {
            if (match.status === Status.Archived)
                continue;

            match.status = Status.Archived;
            await this.applyMatchUpdate(match);
        }
    }

    /**
     * Resets the status of a list of matches to what it should currently be.
     *
     * @param matches The matches to update.
     */
    protected async resetMatchesStatus(matches: Match[]): Promise<void> {
        for (const match of matches) {
            match.status = helpers.getMatchStatus(match);
            await this.applyMatchUpdate(match);
        }
    }

    /**
     * Updates the match(es) following the current match based on this match results.
     *
     * @param match Input of the update.
     * @param matchLocation Location of the current match.
     * @param stage The parent stage.
     * @param roundNumber Number of the round.
     * @param roundCount Count of rounds.
     */
    protected async updateNext(match: Match, matchLocation: GroupType, stage: Stage, roundNumber: number, roundCount: number): Promise<void> {
        const nextMatches = await this.getNextMatches(match, matchLocation, stage, roundNumber, roundCount);
        if (nextMatches.length === 0) {
            // Archive match if it doesn't have following matches and is completed.
            // When the stage is fully complete, all matches should be archived.
            if (match.status === Status.Completed)
                await this.archiveMatches([match]);

            return;
        }

        const winnerSide = helpers.getMatchResult(match);
        const actualRoundNumber = (stage.settings.skipFirstRound && matchLocation === 'winner_bracket') ? roundNumber + 1 : roundNumber;

        if (winnerSide)
            await this.applyToNextMatches(helpers.setNextOpponent, match, matchLocation, actualRoundNumber, roundCount, nextMatches, winnerSide);
        else
            await this.applyToNextMatches(helpers.resetNextOpponent, match, matchLocation, actualRoundNumber, roundCount, nextMatches);
    }

    /**
     * Applies a `SetNextOpponent` function to matches following the current match.
     * 
     * - `nextMatches[0]` is assumed to be next match for the winner of the current match.
     * - `nextMatches[1]` is assumed to be next match for the loser of the current match.
     * 
     * @param setNextOpponent The `SetNextOpponent` function.
     * @param match The current match.
     * @param matchLocation Location of the current match.
     * @param roundNumber Number of the current round.
     * @param roundCount Count of rounds.
     * @param nextMatches The matches following the current match.
     * @param winnerSide Side of the winner in the current match.
     */
    protected async applyToNextMatches(setNextOpponent: SetNextOpponent, match: Match, matchLocation: GroupType, roundNumber: number, roundCount: number, nextMatches: (Match | null)[], winnerSide?: Side): Promise<void> {
        if (matchLocation === 'final_group') {
            if (!nextMatches[0]) throw Error('First next match is null.');
            setNextOpponent(nextMatches[0], 'opponent1', match, 'opponent1');
            setNextOpponent(nextMatches[0], 'opponent2', match, 'opponent2');
            await this.applyMatchUpdate(nextMatches[0]);
            return;
        }

        const nextSide = helpers.getNextSide(match.number, roundNumber, roundCount, matchLocation);

        // First next match
        if (nextMatches[0]) {
            setNextOpponent(nextMatches[0], nextSide, match, winnerSide);
            await this.propagateByeWinners(nextMatches[0]);
        }

        if (nextMatches.length !== 2) return;
        if (!nextMatches[1]) throw Error('Second next match is null.');

        // Second next match
        if (matchLocation === 'single_bracket') {
            // Going into consolation final (single elimination)
            setNextOpponent(nextMatches[1], nextSide, match, winnerSide && helpers.getOtherSide(winnerSide));
            await this.applyMatchUpdate(nextMatches[1]);
        } else if (matchLocation === 'winner_bracket') {
            // Going into loser bracket match (double elimination)
            const nextSideIntoLB = helpers.getNextSideLoserBracket(match.number, nextMatches[1], roundNumber);
            setNextOpponent(nextMatches[1], nextSideIntoLB, match, winnerSide && helpers.getOtherSide(winnerSide));
            await this.propagateByeWinners(nextMatches[1]);
        } else if (matchLocation === 'loser_bracket') {
            // Going into consolation final (double elimination)
            const nextSideIntoConsolationFinal = helpers.getNextSideConsolationFinalDoubleElimination(roundNumber);
            setNextOpponent(nextMatches[1], nextSideIntoConsolationFinal, match, winnerSide && helpers.getOtherSide(winnerSide));
            await this.propagateByeWinners(nextMatches[1]);
        }
    }

    /**
     * Propagates winner against BYEs in related matches.
     * 
     * @param match The current match.
     */
    protected async propagateByeWinners(match: Match): Promise<void> {
        helpers.setMatchResults(match, match, false); // BYE propagation is only in non round-robin stages.
        await this.applyMatchUpdate(match);

        if (helpers.hasBye(match))
            await this.updateRelatedMatches(match, true, true);
    }
}

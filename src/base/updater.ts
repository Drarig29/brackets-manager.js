import { Group, Match, MatchGame, Seeding, Stage, Status } from 'brackets-model';
import { BracketKind, ParticipantSlot, Side } from '../types';
import { SetNextOpponent } from '../helpers';
import { ordering } from '../ordering';
import { Create } from '../create';
import { BaseGetter } from './getter';
import * as helpers from '../helpers';

export class BaseUpdater extends BaseGetter {

    /**
     * Updates or resets the seeding of a stage.
     *
     * @param stageId ID of the stage.
     * @param seeding A new seeding or null to reset the existing seeding.
     */
    protected async updateSeeding(stageId: number, seeding: Seeding | null): Promise<void> {
        const stage = await this.storage.select<Stage>('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        if (seeding && seeding.length !== stage.settings.size)
            throw Error('The size of the seeding is incorrect.');

        const create = new Create(this.storage, {
            name: stage.name,
            tournamentId: stage.tournament_id,
            type: stage.type,
            settings: stage.settings,
            seeding: seeding || undefined,
        });

        create.setExisting(stageId);

        const method = BaseGetter.getSeedingOrdering(stage.type, create);
        const slots = await create.getSlots();

        const matches = await this.getSeedingMatches(stage.id, stage.type);
        if (!matches)
            throw Error('Error getting matches associated to the seeding.');

        const ordered = ordering[method](slots);
        await BaseUpdater.assertCanUpdateSeeding(matches, ordered);

        await create.run();
    }

    /**
     * Updates a parent match based on its child games.
     * 
     * @param parentId ID of the parent match.
     */
    protected async updateParentMatch(parentId: number): Promise<void> {
        const storedParent = await this.storage.select<Match>('match', parentId);
        if (!storedParent) throw Error('Parent not found.');

        const games = await this.storage.select<MatchGame>('match_game', { parent_id: parentId });
        if (!games) throw Error('No match games.');

        const parentScores = helpers.getChildGamesResults(games);
        const parent = helpers.getParentMatchResults(storedParent, parentScores);

        const stage = await this.storage.select<Stage>('stage', storedParent.stage_id);
        if (!stage) throw Error('Stage not found.');

        const inRoundRobin = helpers.isRoundRobin(stage);
        helpers.setParentMatchCompleted(parent, storedParent.child_count, inRoundRobin);

        await this.updateMatch(storedParent, parent, true);
    }

    /**
     * Throws an error if a match is locked and the new seeding will change this match's participants.
     *
     * @param matches The matches stored in the database.
     * @param slots The slots to check from the new seeding.
     */
    protected static async assertCanUpdateSeeding(matches: Match[], slots: ParticipantSlot[]): Promise<void> {
        let index = 0;

        for (const match of matches) {
            const opponent1 = slots[index++];
            const opponent2 = slots[index++];

            const locked = helpers.isMatchParticipantLocked(match);
            if (!locked) continue;

            if (match.opponent1?.id !== opponent1?.id || match.opponent2?.id !== opponent2?.id)
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
        const { roundNumber, roundCount } = await this.getRoundPositionalInfo(match.round_id);

        const stage = await this.storage.select<Stage>('stage', match.stage_id);
        if (!stage) throw Error('Stage not found.');

        const group = await this.storage.select<Group>('group', match.group_id);
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
    protected async updateMatch(stored: Match, match: Partial<Match>, force?: boolean): Promise<void> {
        if (!force && helpers.isMatchUpdateLocked(stored))
            throw Error('The match is locked.');

        const { statusChanged, resultChanged } = helpers.setMatchResults(stored, match);
        await this.applyMatchUpdate(stored);

        // Don't update related matches if it's a simple score update.
        if (!statusChanged && !resultChanged) return;

        const stage = await this.storage.select<Stage>('stage', stored.stage_id);
        if (!stage) throw Error('Stage not found.');

        if (!helpers.isRoundRobin(stage))
            await this.updateRelatedMatches(stored, statusChanged, resultChanged);
    }

    /**
     * Updates a match and its child games.
     *
     * @param match A match.
     */
    protected async applyMatchUpdate(match: Match): Promise<void> {
        if (!await this.storage.update<Match>('match', match.id, match))
            throw Error('Could not update the match.');

        if (match.child_count === 0) return;

        const update: Partial<MatchGame> = {
            opponent1: helpers.toResult(match.opponent1),
            opponent2: helpers.toResult(match.opponent2),
        };

        if (match.status <= Status.Ready || match.status === Status.Archived)
            update.status = match.status;

        if (!await this.storage.update<MatchGame>('match_game', { parent_id: match.id }, update))
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
    protected async updatePrevious(match: Match, matchLocation: BracketKind, stage: Stage, roundNumber: number): Promise<void> {
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
    protected async updateNext(match: Match, matchLocation: BracketKind, stage: Stage, roundNumber: number, roundCount: number): Promise<void> {
        const nextMatches = await this.getNextMatches(match, matchLocation, stage, roundNumber, roundCount);
        if (nextMatches.length === 0) return;

        const winnerSide = helpers.getMatchResult(match);
        const actualRoundNumber = (stage.settings.skipFirstRound && matchLocation === 'winner_bracket') ? roundNumber + 1 : roundNumber;

        if (winnerSide)
            await this.applyToNextMatches(helpers.setNextOpponent, match, matchLocation, actualRoundNumber, roundCount, nextMatches, winnerSide);
        else
            await this.applyToNextMatches(helpers.resetNextOpponent, match, matchLocation, actualRoundNumber, roundCount, nextMatches);
    }

    /**
     * Applies a SetNextOpponent function to matches following the current match.
     *
     * @param setNextOpponent The SetNextOpponent function.
     * @param match The current match.
     * @param matchLocation Location of the current match.
     * @param roundNumber Number of the current round.
     * @param roundCount Count of rounds.
     * @param nextMatches The matches following the current match.
     * @param winnerSide Side of the winner in the current match.
     */
    protected async applyToNextMatches(setNextOpponent: SetNextOpponent, match: Match, matchLocation: BracketKind, roundNumber: number, roundCount: number, nextMatches: (Match | null)[], winnerSide?: Side): Promise<void> {
        if (matchLocation === 'final_group') {
            if (!nextMatches[0]) throw Error('First next match is null.');
            setNextOpponent(nextMatches[0], 'opponent1', match, 'opponent1');
            setNextOpponent(nextMatches[0], 'opponent2', match, 'opponent2');
            await this.applyMatchUpdate(nextMatches[0]);
            return;
        }

        const nextSide = helpers.getNextSide(match.number, roundNumber, roundCount, matchLocation);

        if (nextMatches[0]) {
            setNextOpponent(nextMatches[0], nextSide, match, winnerSide);
            await this.propagateByeWinners(nextMatches[0]);
        }

        if (nextMatches.length !== 2) return;
        if (!nextMatches[1]) throw Error('Second next match is null.');

        // The second match is either the consolation final (single elimination) or a loser bracket match (double elimination).

        if (matchLocation === 'single_bracket') {
            setNextOpponent(nextMatches[1], nextSide, match, winnerSide && helpers.getOtherSide(winnerSide));
            await this.applyMatchUpdate(nextMatches[1]);
        } else {
            const nextSideLB = helpers.getNextSideLoserBracket(match.number, nextMatches[1], roundNumber);
            setNextOpponent(nextMatches[1], nextSideLB, match, winnerSide && helpers.getOtherSide(winnerSide));
            await this.propagateByeWinners(nextMatches[1]);
        }
    }

    /**
     * Propagates winner against BYEs in related matches.
     * 
     * @param match The current match.
     */
    protected async propagateByeWinners(match: Match): Promise<void> {
        helpers.setMatchResults(match, match);
        await this.applyMatchUpdate(match);

        if (helpers.hasBye(match))
            await this.updateRelatedMatches(match, true, true);
    }
}

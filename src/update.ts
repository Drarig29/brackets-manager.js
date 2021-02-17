import { Group, Match, MatchGame, Round, Seeding, SeedOrdering, Stage, StageType, Status } from 'brackets-model';
import { ParticipantSlot, Side, Storage } from './types';
import * as helpers from './helpers';
import { SetNextOpponent } from './helpers';
import { ordering } from './ordering';
import { Create } from './create';

export type Level = 'stage' | 'group' | 'round' | 'match';
export type BracketType = 'single_bracket' | 'winner_bracket' | 'loser_bracket' | 'final_group';

export type RoundInformation = {
    roundNumber: number,
    roundCount: number,
}

export type MatchData = {
    stored: Match,
    inRoundRobin: boolean,
}

export class Update {

    private readonly storage: Storage;

    /**
     * Creates an instance of Update, which will handle the updates for a stage.
     *
     * @param storage The implementation of Storage.
     */
    constructor(storage: Storage) {
        this.storage = storage;
    }

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

        const { stored, inRoundRobin } = await this.getMatchData(match.id);

        const resultChanged = helpers.setMatchResults(stored, match);
        await this.updateMatch(stored);

        // Don't update related matches if it's a simple score update.
        if (!inRoundRobin && resultChanged)
            await this.updateRelatedMatches(stored);
    }

    /**
     * Resets the results of a match.
     *
     * This will update related matches accordingly.
     *
     * @param matchId ID of the match.
     */
    public async resetMatch(matchId: number): Promise<void> {
        const { stored, inRoundRobin } = await this.getMatchData(matchId);

        helpers.resetMatchResults(stored);
        await this.updateMatch(stored);

        if (!inRoundRobin)
            await this.updateRelatedMatches(stored);
    }

    /**
     * Updates partial information of a match game. It's id must be given.
     *
     * This will update the parent match accordingly.
     *
     * @param game Values to change in a match game.
     */
    public async matchGame(game: Partial<MatchGame>): Promise<void> {
        if (game.id === undefined) throw Error('No match game id given.');

        const stored = await this.storage.select<MatchGame>('match_game', game.id);
        if (!stored) throw Error('Match game not found.');

        if (helpers.isMatchUpdateLocked(stored))
            throw Error('The match game is locked.');

        helpers.setMatchResults(stored, game);
        await this.storage.update('match_game', game.id, stored);

        const storedParent = await this.storage.select<Match>('match', stored.parent_id);
        if (!storedParent) throw Error('Parent not found.');

        const games = await this.storage.select<MatchGame>('match_game', { parent_id: stored.parent_id });
        if (!games) throw Error('No match games.');

        const scores = helpers.getChildGamesResults(games);
        const parent = helpers.getParentMatchResults(storedParent, scores);

        helpers.setParentMatchCompleted(storedParent, parent, scores);
        helpers.setMatchResults(storedParent, parent);

        await this.match(storedParent);
    }

    /**
     * Updates the seed ordering of every ordered round in a stage.
     *
     * @param stageId ID of the stage.
     * @param seedOrdering A list of ordering methods.
     */
    public async ordering(stageId: number, seedOrdering: SeedOrdering[]): Promise<void> {
        const stage = await this.storage.select<Stage>('stage', stageId);
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
        const round = await this.storage.select<Round>('round', roundId);
        if (!round) throw Error('This round does not exist.');

        const stage = await this.storage.select<Stage>('stage', round.stage_id);
        if (!stage) throw Error('Stage not found.');

        helpers.ensureNotRoundRobin(stage);

        await this.updateRoundOrdering(round, method);
    }

    /**
     * Update the seed ordering of a round.
     *
     * @param round The round of which to update the ordering.
     * @param method The new ordering method.
     */
    private async updateRoundOrdering(round: Round, method: SeedOrdering): Promise<void> {
        const matches = await this.storage.select<Match>('match', { round_id: round.id });
        if (!matches) throw Error('This round has no match.');

        if (matches.some(match => match.status > Status.Ready))
            throw Error('At least one match has started or is completed.');

        const stage = await this.storage.select<Stage>('stage', round.stage_id);
        if (!stage) throw Error('Stage not found.');
        if (stage.settings.size === undefined) throw Error('Undefined stage size.');

        const group = await this.storage.select<Group>('group', round.group_id);
        if (!group) throw Error('Group not found.');

        const inLoserBracket = helpers.isLoserBracket(stage.type, group.number);
        const roundCountLB = helpers.lowerBracketRoundCount(stage.settings.size);
        const seeds = helpers.getSeeds(inLoserBracket, round.number, roundCountLB, matches.length);
        const positions = ordering[method](seeds);

        await this.applyRoundOrdering(round.number, matches, positions);
    }

    /**
     * Updates child count of all matches of a given level.
     *
     * @param level The level at which to act.
     * @param id ID of the chosen level.
     * @param childCount The target child count.
     */
    public async matchChildCount(level: Level, id: number, childCount: number): Promise<void> {
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
                const match = await this.storage.select<Match>('match', id);
                if (!match) throw Error('Match not found.');
                await this.adjustMatchChildGames(match, childCount);
                break;
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
     * Resets the seeding of a stage.
     *
     * @param stageId ID of the stage.
     */
    public async resetSeeding(stageId: number): Promise<void> {
        await this.updateSeeding(stageId, null);
    }

    /**
     * Propagates winner against BYEs in related matches.
     * 
     * @param match The current match.
     */
    private async propagateByeWinners(match: Match): Promise<void> {
        helpers.setMatchResults(match, match);
        await this.updateMatch(match);

        if (helpers.hasBye(match))
            await this.updateRelatedMatches(match);
    }

    /**
     * Updates or resets the seeding of a stage.
     *
     * @param stageId ID of the stage.
     * @param seeding A new seeding or null to reset the existing seeding.
     */
    private async updateSeeding(stageId: number, seeding: Seeding | null): Promise<void> {
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
        }, true);

        const method = Update.getSeedingOrdering(stage.type, create);
        const slots = await create.getSlots();

        const matches = await this.getSeedingMatches(stage.id, stage.type);
        if (!matches)
            throw Error('Error getting matches associated to the seeding.');

        const ordered = ordering[method](slots);
        await Update.assertCanUpdateSeeding(matches, ordered);

        await create.run();
    }

    /**
     * Returns the good seeding ordering based on the stage's type.
     *
     * @param stageType The type of the stage.
     * @param create A reference to a Create instance.
     */
    private static getSeedingOrdering(stageType: StageType, create: Create): SeedOrdering {
        return stageType === 'round_robin' ? create.getRoundRobinOrdering() : create.getStandardBracketFirstRoundOrdering();
    }

    /**
     * Returns the matches which contain the seeding of a stage based on its type.
     *
     * @param stageId ID of the stage.
     * @param stageType The type of the stage.
     */
    private async getSeedingMatches(stageId: number, stageType: StageType): Promise<Match[] | null> {
        if (stageType === 'round_robin')
            return this.storage.select<Match>('match', { stage_id: stageId });

        const firstRound = await this.getUpperBracketFirstRound(stageId);
        return this.storage.select<Match>('match', { round_id: firstRound.id });
    }

    /**
     * Gets all the rounds that contain ordered participants.
     *
     * @param stage The stage to get rounds from.
     */
    private async getOrderedRounds(stage: Stage): Promise<Round[]> {
        if (!stage?.settings.size) throw Error('The stage has no size.');

        if (stage.type === 'single_elimination')
            return this.getOrderedRoundsSingleElimination(stage.id);

        return this.getOrderedRoundsDoubleElimination(stage.id);
    }

    /**
     * Gets all the rounds that contain ordered participants in a single elimination stage.
     *
     * @param stageId ID of the stage.
     */
    private async getOrderedRoundsSingleElimination(stageId: number): Promise<Round[]> {
        return [await this.getUpperBracketFirstRound(stageId)];
    }

    /**
     * Gets all the rounds that contain ordered participants in a double elimination stage.
     *
     * @param stageId ID of the stage.
     */
    private async getOrderedRoundsDoubleElimination(stageId: number): Promise<Round[]> {
        // Getting all rounds instead of cherry-picking them is the least expensive.
        const rounds = await this.storage.select<Round>('round', { stage_id: stageId });
        if (!rounds) throw Error('Error getting rounds.');

        const loserBracket = await this.getLoserBracket(stageId);
        if (!loserBracket) throw Error('Loser bracket not found.');

        const firstRoundWB = rounds[0];

        const roundsLB = rounds.filter(r => r.group_id === loserBracket.id);
        const orderedRoundsLB = roundsLB.filter(r => helpers.isOrderingSupportedLoserBracket(r.number, roundsLB.length));

        return [firstRoundWB, ...orderedRoundsLB];
    }

    /**
     * Throws an error if a match is locked and the new seeding will change this match's participants.
     *
     * @param matches The matches stored in the database.
     * @param slots The slots to check from the new seeding.
     */
    private static async assertCanUpdateSeeding(matches: Match[], slots: ParticipantSlot[]): Promise<void> {
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
     * Updates child count of all matches of a stage.
     *
     * @param stageId ID of the stage.
     * @param childCount The target child count.
     */
    private async updateStageMatchChildCount(stageId: number, childCount: number): Promise<void> {
        await this.storage.update<Match>('match', { stage_id: stageId }, { child_count: childCount });

        const matches = await this.storage.select<Match>('match', { stage_id: stageId });
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
        await this.storage.update<Match>('match', { group_id: groupId }, { child_count: childCount });

        const matches = await this.storage.select<Match>('match', { group_id: groupId });
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
        await this.storage.update<Match>('match', { round_id: roundId }, { child_count: childCount });

        const matches = await this.storage.select<Match>('match', { round_id: roundId });
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

            await this.storage.update<Match>('match', updated.id, updated);
        }
    }

    /**
     * Adds or deletes match games of a match based on a target child count.
     *
     * @param match The match of which child games need to be adjusted.
     * @param targetChildCount The target child count.
     */
    private async adjustMatchChildGames(match: Match, targetChildCount: number): Promise<void> {
        const games = await this.storage.select<MatchGame>('match_game', { parent_id: match.id });
        let childCount = games ? games.length : 0;

        while (childCount < targetChildCount) {
            await this.storage.insert<MatchGame>('match_game', {
                number: childCount + 1,
                parent_id: match.id,
                status: match.status,
                opponent1: { id: null },
                opponent2: { id: null },
            });

            childCount++;
        }

        while (childCount > targetChildCount) {
            await this.storage.delete<MatchGame>('match_game', {
                parent_id: match.id,
                number: childCount,
            });

            childCount--;
        }
    }

    /**
     * Updates the matches related (previous and next) to a match.
     *
     * @param match A match.
     */
    private async updateRelatedMatches(match: Match): Promise<void> {
        const { roundNumber, roundCount } = await this.getRoundInfos(match.group_id, match.round_id);

        const stage = await this.storage.select<Stage>('stage', match.stage_id);
        if (!stage) throw Error('Stage not found.');

        const group = await this.storage.select<Group>('group', match.group_id);
        if (!group) throw Error('Group not found.');

        const matchLocation = helpers.getMatchLocation(stage.type, group.number);

        await this.updatePrevious(match, matchLocation, stage, roundNumber);
        await this.updateNext(match, matchLocation, stage, roundNumber, roundCount);
    }

    /**
     * Updates a match and its child games.
     *
     * @param match A match.
     */
    private async updateMatch(match: Match): Promise<void> {
        await this.storage.update('match', match.id, match);

        if (match.child_count > 0) {
            await this.storage.update<MatchGame>('match_game', { parent_id: match.id }, {
                status: match.status,
                opponent1: helpers.toResult(match.opponent1),
                opponent2: helpers.toResult(match.opponent2),
            });
        }
    }

    /**
     * Updates the match(es) leading to the current match based on this match results.
     *
     * @param match Input of the update.
     * @param matchLocation Location of the current match.
     * @param stage The parent stage.
     * @param roundNumber Number of the round.
     */
    private async updatePrevious(match: Match, matchLocation: BracketType, stage: Stage, roundNumber: number): Promise<void> {
        const previousMatches = await this.getPreviousMatches(match, matchLocation, stage, roundNumber);
        if (previousMatches.length === 0) return;

        const winnerSide = helpers.getMatchResult(match);
        if (match.status === Status.Completed && !winnerSide) throw Error('Cannot find a winner.');

        if (winnerSide)
            await this.archiveMatches(previousMatches);
        else
            await this.resetMatchesStatus(previousMatches);
    }

    /**
     * Sets the status of a list of matches to archived.
     *
     * @param matches The matches to update.
     */
    private async archiveMatches(matches: Match[]): Promise<void> {
        for (const match of matches) {
            match.status = Status.Archived;
            await this.updateMatch(match);
        }
    }

    /**
     * Resets the status of a list of matches to what it should currently be.
     *
     * @param matches The matches to update.
     */
    private async resetMatchesStatus(matches: Match[]): Promise<void> {
        for (const match of matches) {
            match.status = helpers.getMatchStatus(match);
            await this.updateMatch(match);
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
    private async updateNext(match: Match, matchLocation: BracketType, stage: Stage, roundNumber: number, roundCount: number): Promise<void> {
        const nextMatches = await this.getNextMatches(match, matchLocation, stage, roundNumber, roundCount);
        if (nextMatches.length === 0) return;

        const winnerSide = helpers.getMatchResult(match);
        if (match.status === Status.Completed && !winnerSide) throw Error('Cannot find a winner.');

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
    private async applyToNextMatches(setNextOpponent: SetNextOpponent, match: Match, matchLocation: BracketType, roundNumber: number, roundCount: number, nextMatches: Match[], winnerSide?: Side): Promise<void> {
        if (matchLocation === 'final_group') {
            setNextOpponent(nextMatches, 0, 'opponent1', match, 'opponent1');
            setNextOpponent(nextMatches, 0, 'opponent2', match, 'opponent2');
            await this.updateMatch(nextMatches[0]);
            return;
        }

        const nextSide = helpers.getNextSide(match.number, roundNumber, roundCount, matchLocation);
        setNextOpponent(nextMatches, 0, nextSide, match, winnerSide);
        await this.updateMatch(nextMatches[0]);

        if (nextMatches.length !== 2) return;

        // The second match is either the consolation final (single elimination) or a loser bracket match (double elimination).

        if (matchLocation === 'single_bracket') {
            setNextOpponent(nextMatches, 1, nextSide, match, winnerSide && helpers.getOtherSide(winnerSide));
            await this.updateMatch(nextMatches[1]);
        } else {
            const nextSideLB = helpers.getNextSideLoserBracket(match.number, nextMatches[1], roundNumber);
            setNextOpponent(nextMatches, 1, nextSideLB, match, winnerSide && helpers.getOtherSide(winnerSide));
            await this.propagateByeWinners(nextMatches[1]);
        }
    }

    /**
     * Gets the number of a round based on its id and the count of rounds in the group.
     *
     * @param groupId ID of the group.
     * @param roundId ID of the round.
     */
    private async getRoundInfos(groupId: number, roundId: number): Promise<RoundInformation> {
        const rounds = await this.storage.select<Round>('round', { group_id: groupId });
        if (!rounds) throw Error('Error getting rounds.');

        const round = rounds.find(r => r.id === roundId);
        if (!round) throw Error('Round not found.');

        return {
            roundNumber: round.number,
            roundCount: rounds.length,
        };
    }

    /**
     * Gets the matches leading to the given match.
     *
     * @param match The current match.
     * @param matchLocation Location of the current match.
     * @param stage The parent stage.
     * @param roundNumber Number of the round.
     */
    private async getPreviousMatches(match: Match, matchLocation: BracketType, stage: Stage, roundNumber: number): Promise<Match[]> {
        if (matchLocation === 'loser_bracket')
            return this.getPreviousMatchesLB(match, stage, roundNumber);

        if (matchLocation === 'final_group')
            return this.getPreviousMatchesFinal(match, roundNumber);

        if (roundNumber === 1)
            return []; // The match is in the first round of an upper bracket.

        return this.getMatchesBeforeMajorRound(match, roundNumber);
    }

    /**
     * Gets the matches leading to the given match, which is in a final group (consolation final or grand final).
     *
     * @param match The current match.
     * @param roundNumber Number of the current round.
     */
    private async getPreviousMatchesFinal(match: Match, roundNumber: number): Promise<Match[]> {
        if (roundNumber > 1)
            return [await this.findMatch(match.group_id, roundNumber - 1, 1)];

        const upperBracket = await this.getUpperBracket(match.stage_id);
        const lastRound = await this.getLastRound(upperBracket.id);

        const upperBracketFinalMatch = await this.storage.selectFirst<Match>('match', {
            round_id: lastRound.id,
            number: 1,
        });

        if (upperBracketFinalMatch === null)
            throw Error('Match not found.');

        return [upperBracketFinalMatch];
    }

    /**
     * Gets the matches leading to a given match from the loser bracket.
     *
     * @param match The current match.
     * @param stage The parent stage.
     * @param roundNumber Number of the round.
     */
    private async getPreviousMatchesLB(match: Match, stage: Stage, roundNumber: number): Promise<Match[]> {
        if (stage.settings.skipFirstRound && roundNumber === 1)
            return [];

        if (helpers.hasBye(match))
            return []; // Shortcut because we are coming from propagateByes().

        const winnerBracket = await this.getUpperBracket(match.stage_id);
        const actualRoundNumberWB = Math.ceil((roundNumber + 1) / 2);

        const roundNumberWB = stage.settings.skipFirstRound ? actualRoundNumberWB - 1 : actualRoundNumberWB;

        if (roundNumber === 1)
            return this.getMatchesBeforeFirstRoundLB(match, winnerBracket.id, roundNumberWB);

        if (roundNumber % 2 === 0)
            return this.getMatchesBeforeMinorRoundLB(match, winnerBracket.id, roundNumber, roundNumberWB);

        return this.getMatchesBeforeMajorRound(match, roundNumber);
    }

    /**
     * Gets the matches leading to a given match in a major round (every round of upper bracket or specific ones in lower bracket).
     *
     * @param match The current match.
     * @param roundNumber Number of the round.
     */
    private async getMatchesBeforeMajorRound(match: Match, roundNumber: number): Promise<Match[]> {
        return [
            await this.findMatch(match.group_id, roundNumber - 1, match.number * 2 - 1),
            await this.findMatch(match.group_id, roundNumber - 1, match.number * 2),
        ];
    }

    /**
     * Gets the matches leading to a given match in the first round of the loser bracket.
     *
     * @param match The current match.
     * @param winnerBracketId ID of the winner bracket.
     * @param roundNumberWB The number of the previous round in the winner bracket.
     */
    private async getMatchesBeforeFirstRoundLB(match: Match, winnerBracketId: number, roundNumberWB: number): Promise<Match[]> {
        return [
            await this.findMatch(winnerBracketId, roundNumberWB, helpers.getOriginPosition(match, 'opponent1')),
            await this.findMatch(winnerBracketId, roundNumberWB, helpers.getOriginPosition(match, 'opponent2')),
        ];
    }

    /**
     * Gets the matches leading to a given match in a minor round of the loser bracket.
     *
     * @param match The current match.
     * @param winnerBracketId ID of the winner bracket.
     * @param roundNumber Number of the current round.
     * @param roundNumberWB The number of the previous round in the winner bracket.
     */
    private async getMatchesBeforeMinorRoundLB(match: Match, winnerBracketId: number, roundNumber: number, roundNumberWB: number): Promise<Match[]> {
        const matchNumber = helpers.getOriginPosition(match, 'opponent1');

        return [
            await this.findMatch(winnerBracketId, roundNumberWB, matchNumber),
            await this.findMatch(match.group_id, roundNumber - 1, matchNumber),
        ];
    }

    /**
     * Gets the match(es) where the opponents of the current match will go just after.
     *
     * @param match The current match.
     * @param matchLocation Location of the current match.
     * @param stage The parent stage.
     * @param roundNumber The number of the current round.
     * @param roundCount Count of rounds.
     */
    private async getNextMatches(match: Match, matchLocation: BracketType, stage: Stage, roundNumber: number, roundCount: number): Promise<Match[]> {
        switch (matchLocation) {
            case 'single_bracket':
                return this.getNextMatchesUpperBracket(match, stage.type, roundNumber, roundCount);
            case 'winner_bracket':
                return this.getNextMatchesWB(match, stage, roundNumber, roundCount);
            case 'loser_bracket':
                return this.getNextMatchesLB(match, stage.type, roundNumber, roundCount);
            case 'final_group':
                return this.getNextMatchesFinal(match, roundNumber, roundCount);
        }
    }

    /**
     * Gets the match(es) where the opponents of the current match of winner bracket will go just after.
     *
     * @param match The current match.
     * @param stage The parent stage.
     * @param roundNumber The number of the current round.
     * @param roundCount Count of rounds.
     */
    private async getNextMatchesWB(match: Match, stage: Stage, roundNumber: number, roundCount: number): Promise<Match[]> {
        const loserBracket = await this.getLoserBracket(match.stage_id);
        if (loserBracket === null) // Only one match in the stage, there is no loser bracket.
            return [];

        const actualRoundNumber = stage.settings.skipFirstRound ? roundNumber + 1 : roundNumber;
        const roundNumberLB = actualRoundNumber > 1 ? (actualRoundNumber - 1) * 2 : 1;
        const matchNumberLB = actualRoundNumber > 1 ? match.number : helpers.getDiagonalMatchNumber(match.number);

        const participantCount = stage.settings.size!;
        const method = helpers.getLoserOrdering(stage.settings.seedOrdering!, roundNumberLB);
        const actualMatchNumberLB = helpers.findLoserMatchNumber(participantCount, roundNumberLB, matchNumberLB, method);

        return [
            ...await this.getNextMatchesUpperBracket(match, stage.type, roundNumber, roundCount),
            await this.findMatch(loserBracket.id, roundNumberLB, actualMatchNumberLB),
        ];
    }

    /**
     * Gets the match(es) where the opponents of the current match of an upper bracket will go just after.
     *
     * @param match The current match.
     * @param stageType Type of the stage.
     * @param roundNumber The number of the current round.
     * @param roundCount Count of rounds.
     */
    private async getNextMatchesUpperBracket(match: Match, stageType: StageType, roundNumber: number, roundCount: number): Promise<Match[]> {
        if (stageType === 'single_elimination')
            return this.getNextMatchesUpperBracketSingleElimination(match, stageType, roundNumber, roundCount);

        if (stageType === 'double_elimination' && roundNumber === roundCount)
            return this.getFirstMatchFinal(match, stageType);

        return [await this.getDiagonalMatch(match.group_id, roundNumber, match.number)];
    }

    /**
     * Gets the match(es) where the opponents of the current match of the unique bracket of a single elimination will go just after.
     *
     * @param match The current match.
     * @param stageType Type of the stage.
     * @param roundNumber The number of the current round.
     * @param roundCount Count of rounds.
     */
    private async getNextMatchesUpperBracketSingleElimination(match: Match, stageType: StageType, roundNumber: number, roundCount: number): Promise<Match[]> {
        if (roundNumber === roundCount - 1) {
            return [
                await this.getDiagonalMatch(match.group_id, roundNumber, match.number),
                ...await this.getFirstMatchFinal(match, stageType),
            ];
        }

        if (roundNumber === roundCount)
            return [];

        return [await this.getDiagonalMatch(match.group_id, roundNumber, match.number)];
    }

    /**
     * Gets the match(es) where the opponents of the current match of loser bracket will go just after.
     *
     * @param match The current match.
     * @param stageType Type of the stage.
     * @param roundNumber The number of the current round.
     * @param roundCount Count of rounds.
     */
    private async getNextMatchesLB(match: Match, stageType: StageType, roundNumber: number, roundCount: number): Promise<Match[]> {
        if (roundNumber === roundCount)
            return this.getFirstMatchFinal(match, stageType);

        if (roundNumber % 2 === 1)
            return this.getMatchAfterMajorRoundLB(match, roundNumber);

        return this.getMatchAfterMinorRoundLB(match, roundNumber);
    }

    /**
     * Gets the first match of the final group (consolation final or grand final).
     *
     * @param match The current match.
     * @param stageType Type of the stage.
     */
    private async getFirstMatchFinal(match: Match, stageType: StageType): Promise<Match[]> {
        const finalGroupId = await this.getFinalGroupId(match.stage_id, stageType);
        if (finalGroupId === null)
            return [];

        return [await this.findMatch(finalGroupId, 1, 1)];
    }

    /**
     * Gets the matches following the current match, which is in the final group (consolation final or grand final).
     *
     * @param match The current match.
     * @param roundNumber The number of the current round.
     * @param roundCount The count of rounds.
     */
    private async getNextMatchesFinal(match: Match, roundNumber: number, roundCount: number): Promise<Match[]> {
        if (roundNumber === roundCount)
            return [];

        return [await this.findMatch(match.group_id, roundNumber + 1, 1)];
    }

    /**
     * Gets the match(es) where the opponents of the current match of a winner bracket's major round will go just after.
     *
     * @param match The current match.
     * @param roundNumber The number of the current round.
     */
    private async getMatchAfterMajorRoundLB(match: Match, roundNumber: number): Promise<Match[]> {
        return [await this.getParallelMatch(match.group_id, roundNumber, match.number)];
    }

    /**
     * Gets the match(es) where the opponents of the current match of a winner bracket's minor round will go just after.
     *
     * @param match The current match.
     * @param roundNumber The number of the current round.
     */
    private async getMatchAfterMinorRoundLB(match: Match, roundNumber: number): Promise<Match[]> {
        return [await this.getDiagonalMatch(match.group_id, roundNumber, match.number)];
    }

    /**
     * Returns what is needed to update a match.
     *
     * @param matchId ID of the match.
     */
    private async getMatchData(matchId: number): Promise<MatchData> {
        const stored = await this.storage.select<Match>('match', matchId);
        if (!stored) throw Error('Match not found.');

        const stage = await this.storage.select<Stage>('stage', stored.stage_id);
        if (!stage) throw Error('Stage not found.');

        const inRoundRobin = helpers.isRoundRobin(stage);
        if (!inRoundRobin && helpers.isMatchUpdateLocked(stored))
            throw Error('The match is locked.');

        return { stored, inRoundRobin };
    }

    /**
     * Gets the first round of the upper bracket.
     *
     * @param stageId ID of the stage.
     */
    private async getUpperBracketFirstRound(stageId: number): Promise<Round> {
        // Considering the database is ordered, this round will always be the first round of the upper bracket.
        const firstRound = await this.storage.selectFirst<Round>('round', { stage_id: stageId, number: 1 });
        if (!firstRound) throw Error('Round not found.');
        return firstRound;
    }

    /**
     * Gets the last round of a group.
     *
     * @param groupId ID of the group.
     */
    private async getLastRound(groupId: number): Promise<Round> {
        const round = await this.storage.selectLast<Round>('round', { group_id: groupId });
        if (!round) throw Error('Error getting rounds.');
        return round;
    }

    /**
     * Returns the id of the final group (consolation final or grand final).
     *
     * @param stageId ID of the stage.
     * @param stageType Type of the stage.
     */
    private async getFinalGroupId(stageId: number, stageType: StageType): Promise<number | null> {
        const groupNumber = stageType === 'single_elimination' ? 2 /* Consolation final */ : 3 /* Grand final */;
        const finalGroup = await this.storage.selectFirst<Group>('group', { stage_id: stageId, number: groupNumber });
        if (!finalGroup) return null;
        return finalGroup.id;
    }

    /**
     * Gets the upper bracket (the only bracket if single elimination or the winner bracket in double elimination).
     *
     * @param stageId ID of the stage.
     */
    private async getUpperBracket(stageId: number): Promise<Group> {
        const winnerBracket = await this.storage.selectFirst<Group>('group', { stage_id: stageId, number: 1 });
        if (!winnerBracket) throw Error('Winner bracket not found.');
        return winnerBracket;
    }

    /**
     * Gets the loser bracket.
     *
     * @param stageId ID of the stage.
     */
    private async getLoserBracket(stageId: number): Promise<Group | null> {
        return this.storage.selectFirst<Group>('group', { stage_id: stageId, number: 2 });
    }

    /**
     * Gets the corresponding match in the next round ("diagonal match") the usual way.
     *
     * Just like from Round 1 to Round 2 in a single elimination stage.
     *
     * @param groupId ID of the group.
     * @param roundNumber Number of the round in its parent group.
     * @param matchNumber Number of the match in its parent round.
     */
    private async getDiagonalMatch(groupId: number, roundNumber: number, matchNumber: number): Promise<Match> {
        return this.findMatch(groupId, roundNumber + 1, helpers.getDiagonalMatchNumber(matchNumber));
    }

    /**
     * Gets the corresponding match in the next round ("parallel match") the "major round to minor round" way.
     *
     * Just like from Round 1 to Round 2 in the loser bracket of a double elimination stage.
     *
     * @param groupId ID of the group.
     * @param roundNumber Number of the round in its parent group.
     * @param matchNumber Number of the match in its parent round.
     */
    private async getParallelMatch(groupId: number, roundNumber: number, matchNumber: number): Promise<Match> {
        return this.findMatch(groupId, roundNumber + 1, matchNumber);
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
    private async findMatch(groupId: number, roundNumber: number, matchNumber: number): Promise<Match> {
        const round = await this.storage.selectFirst<Round>('round', {
            group_id: groupId,
            number: roundNumber,
        });

        if (!round) throw Error('Round not found.');

        const match = await this.storage.selectFirst<Match>('match', {
            round_id: round.id,
            number: matchNumber,
        });

        if (!match) throw Error('Match not found.');
        return match;
    }
}

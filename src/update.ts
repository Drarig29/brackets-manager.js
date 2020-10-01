import { Match, Round, Group, Stage, MatchGame, SeedOrdering, Seeding, SeedingIds, Status, StageType } from "brackets-model";
import { ordering } from './ordering';
import { IStorage } from "./storage";
import * as helpers from './helpers';
import { Create } from "./create";

export type Level = 'stage' | 'group' | 'round' | 'match';

export class Update {

    private storage: IStorage;

    constructor(storage: IStorage) {
        this.storage = storage;
    }

    /**
     * Updates partial information of a match. Its id must be given.
     * 
     * This will update related matches accordingly.
     * @param match Values to change in a match.
     */
    public async match(match: Partial<Match>) {
        if (match.id === undefined)
            throw Error('No match id given.');

        const { stored, inRoundRobin } = await this.getMatchData(match.id);

        const completed = helpers.setMatchResults(stored, match);
        await this.storage.update('match', match.id, stored);

        if (!inRoundRobin && completed)
            await this.updateRelatedMatches(stored);
    }

    /**
     * Resets the results of a match.
     * 
     * This will update related matches accordingly.
     * @param matchId ID of the match.
     */
    public async resetMatch(matchId: number) {
        const { stored, inRoundRobin } = await this.getMatchData(matchId);

        helpers.resetMatchResults(stored);
        await this.storage.update('match', matchId, stored);

        if (!inRoundRobin)
            await this.updateRelatedMatches(stored);
    }

    /**
     * Updates partial information of a match game. It's id must be given.
     * 
     * This will update the parent match accordingly.
     * @param game Values to change in a match game.
     */
    public async matchGame(game: Partial<MatchGame>) {
        if (game.id === undefined) throw Error('No match game id given.');

        const stored = await this.storage.select<MatchGame>('match_game', game.id);
        if (!stored) throw Error('Match game not found.');

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

        await this.storage.update('match', storedParent.id, storedParent);
    }

    /**
     * Updates the seed ordering of every ordered round in a stage.
     * @param stageId ID of the stage.
     * @param seedOrdering A list of ordering methods.
     */
    public async ordering(stageId: number, seedOrdering: SeedOrdering[]) {
        const stage = await this.storage.select<Stage>('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        helpers.ensureNotRoundRobin(stage);

        const rounds = await this.getOrderedRounds(stage);

        for (let i = 0; i < rounds.length; i++)
            await this.updateRoundOrdering(rounds[i].id, rounds[i], seedOrdering[i]);
    }

    /**
     * Updates the seed ordering of a round.
     * @param roundId ID of the round.
     * @param method Seed ordering method.
     */
    public async roundOrdering(roundId: number, method: SeedOrdering) {
        const round = await this.storage.select<Round>('round', roundId);
        if (!round) throw Error('This round does not exist.');

        const stage = await this.storage.select<Stage>('stage', round.stage_id);
        if (!stage) throw Error('Stage not found.');

        helpers.ensureNotRoundRobin(stage);
        
        await this.updateRoundOrdering(roundId, round, method);
    }

    private async updateRoundOrdering(roundId: number, round: Round, method: SeedOrdering) {
        const matches = await this.storage.select<Match>('match', { round_id: roundId });
        if (!matches) throw Error('This round has no match.');

        if (matches.some(match => match.status > Status.Ready))
            throw Error('At least one match has started or is completed.');

        const group = await this.storage.select<Group>('group', round.group_id);
        if (!group) throw Error('Group not found.');

        const inLoserBracket = helpers.isLoserBracket(group);
        const seeds = helpers.getSeeds(inLoserBracket, round.number, matches.length);
        const positions = ordering[method](seeds);

        await this.applyRoundOrdering(round.number, matches, positions);
    }

    /**
     * Updates child count of all matches of a given level.
     * @param level The level at which to act.
     * @param id ID of the chosen level.
     * @param childCount The target child count.
     */
    public async matchChildCount(level: Level, id: number, childCount: number) {
        switch (level) {
            case 'stage':
                return this.updateStageMatchChildCount(id, childCount);
            case 'group':
                return this.updateGroupMatchChildCount(id, childCount);
            case 'round':
                return this.updateRoundMatchChildCount(id, childCount);
            case 'match':
                return this.updateMatchChildCount(id, childCount);
        }
    }

    /**
     * Updates the seeding of a stage.
     * @param stageId ID of the stage.
     * @param seeding The new seeding.
     */
    public async seeding(stageId: number, seeding: Seeding | SeedingIds) {
        const stage = await this.storage.select<Stage>('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        const create = new Create(this.storage, {
            name: stage.name,
            tournamentId: stage.tournament_id,
            type: stage.type,
            settings: stage.settings,
            seeding,
        }, true);

        const method = this.getSeedingOrdering(stage.type, create);
        const slots = await create.getSlots();

        const matches = await this.getSeedingMatches(stage.id, stage.type);
        if (!matches)
            throw Error('Error getting first matches.');

        const ordered = ordering[method](slots);
        await this.assertCanUpdateSeeding(matches, ordered);

        return create.run();
    }

    /**
     * Returns the good seeding ordering based on the stage's type.
     * @param stageType The type of the stage.
     * @param create A reference to a Create instance.
     */
    private getSeedingOrdering(stageType: StageType, create: Create) {
        return stageType === 'round_robin' ? create.getRoundRobinOrdering() : create.getStandardBracketFirstRoundOrdering();
    }

    /**
     * Returns the matches which contain the seeding of a stage based on its type.
     * @param stageId ID of the stage.
     * @param stageType The type of the stage.
     */
    private async getSeedingMatches(stageId: number, stageType: StageType) {
        if (stageType === 'round_robin')
            return this.storage.select<Match>('match', { stage_id: stageId });

        const firstRound = await this.getUpperBracketFirstRound(stageId);
        return this.storage.select<Match>('match', { round_id: firstRound.id });
    }

    private async getOrderedRounds(stage: Stage) {
        if (!stage?.settings.size) throw Error('The stage has no size.');

        if (stage.type === 'single_elimination')
            return this.getOrderedRoundsSingleElimination(stage.id);

        return this.getOrderedRoundsDoubleElimination(stage.id, stage.settings.size);
    }

    private async getOrderedRoundsSingleElimination(stageId: number) {
        return [await this.getUpperBracketFirstRound(stageId)];
    }

    private async getOrderedRoundsDoubleElimination(stageId: number, stageSize: number) {
        // Getting all rounds instead of cherry-picking them is the least expensive.
        const rounds = await this.storage.select<Round>('round', { stage_id: stageId });
        if (!rounds) throw Error('Error getting rounds.');

        const roundCountWB = helpers.upperBracketRoundCount(stageSize);
        const roundsLB = rounds.slice(roundCountWB);

        // TODO: do not order the last minor round of a loser bracket --> it's useless (everywhere)
        return [rounds[0], ...roundsLB.filter((_, i) => i === 0 || i % 2 === 1)];
    }

    /**
     * Throws an error if a match is locked and the new seeding will change this match's participants.
     * @param matches The matches stored in the database.
     * @param slots The slots to check from the new seeding.
     */
    private async assertCanUpdateSeeding(matches: Match[], slots: ParticipantSlot[]) {
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
     * @param stageId ID of the stage.
     * @param childCount The target child count.
     */
    private async updateStageMatchChildCount(stageId: number, childCount: number) {
        await this.storage.update<Match>('match', { stage_id: stageId }, { child_count: childCount });

        const matches = await this.storage.select<Match>('match', { stage_id: stageId });
        if (!matches) throw Error('This stage has no match.');

        for (const match of matches)
            await this.updateMatchChildCount(match.id, childCount);
    }

    /**
     * Updates child count of all matches of a group.
     * @param groupId ID of the group.
     * @param childCount The target child count.
     */
    private async updateGroupMatchChildCount(groupId: number, childCount: number) {
        await this.storage.update<Match>('match', { group_id: groupId }, { child_count: childCount });

        const matches = await this.storage.select<Match>('match', { group_id: groupId });
        if (!matches) throw Error('This group has no match.');

        for (const match of matches)
            await this.updateMatchChildCount(match.id, childCount);
    }

    /**
     * Updates child count of all matches of a round.
     * @param roundId ID of the round.
     * @param childCount The target child count.
     */
    private async updateRoundMatchChildCount(roundId: number, childCount: number) {
        await this.storage.update<Match>('match', { round_id: roundId }, { child_count: childCount });

        const matches = await this.storage.select<Match>('match', { round_id: roundId });
        if (!matches) throw Error('This round has no match.');

        for (const match of matches)
            await this.updateMatchChildCount(match.id, childCount);
    }

    /**
     * Updates the ordering of participants in a round's matches.
     * @param roundNumber The number of the round.
     * @param matches The matches of the round.
     * @param positions The new positions.
     */
    private async applyRoundOrdering(roundNumber: number, matches: Match[], positions: number[]) {
        for (const match of matches) {
            const updated = { ...match }; // Create a copy of the match... workaround for node-json-db, which returns a reference to data.
            updated.opponent1 = helpers.findPosition(matches, positions.shift()!);

            // The only rounds where we have a second ordered participant are first rounds of brackets (upper and lower).
            if (roundNumber === 1)
                updated.opponent2 = helpers.findPosition(matches, positions.shift()!);

            await this.storage.update<Match>('match', updated.id, updated);
        }
    }

    /**
     * Updates child count for a match.
     * @param matchId ID of the match.
     * @param targetChildCount The target child count.
     */
    private async updateMatchChildCount(matchId: number, targetChildCount: number) {
        const games = await this.storage.select<MatchGame>('match_game', { parent_id: matchId });
        let childCount = games ? games.length : 0;

        while (childCount < targetChildCount) {
            await this.storage.insert<MatchGame>('match_game', {
                number: childCount + 1,
                parent_id: matchId,
                status: Status.Locked,
                opponent1: { id: null },
                opponent2: { id: null },
            });

            childCount++;
        }

        while (childCount > targetChildCount) {
            await this.storage.delete<MatchGame>('match_game', {
                parent_id: matchId,
                number: childCount,
            });

            childCount--;
        }
    }

    /**
     * Updates the matches related (previous and next) to a match.
     * @param stored The match stored in database.
     */
    private async updateRelatedMatches(stored: Match) {
        const roundNumber = await this.getRoundNumber(stored.round_id);

        const group = await this.storage.select<Group>('group', stored.group_id);
        if (!group) throw Error('Group not found.');

        const inWinnerBracket = helpers.isWinnerBracket(group);
        const inLoserBracket = helpers.isLoserBracket(group);

        await this.updatePrevious(stored, roundNumber, inLoserBracket);
        await this.updateNext(stored, roundNumber, inWinnerBracket, inLoserBracket);
    }

    /**
     * Updates the match(es) leading to the current match based on this match results.
     * @param match Input of the update.
     */
    private async updatePrevious(match: Match, roundNumber: number, inLoserBracket: boolean) {
        const previousMatches = await this.getPreviousMatches(match, roundNumber, inLoserBracket);
        if (previousMatches.length === 0) return;

        const winnerSide = helpers.getMatchResult(match);
        if (match.status === Status.Completed && !winnerSide) throw Error('Cannot find a winner.');

        if (winnerSide)
            this.setPrevious(previousMatches);
        else
            this.resetPrevious(previousMatches);
    }

    /**
     * Sets the status of previous matches to archived.
     * @param previousMatches The matches to update.
     */
    private async setPrevious(previousMatches: Match[]) {
        for (const match of previousMatches) {
            match.status = Status.Archived;
            await this.storage.update('match', match.id, match);
        }
    }

    /**
     * Resets the status of previous matches to what it should currently be.
     * @param previousMatches The matches to update.
     */
    private async resetPrevious(previousMatches: Match[]) {
        for (const match of previousMatches) {
            match.status = helpers.getMatchStatus([match.opponent1, match.opponent2]);
            await this.storage.update('match', match.id, match);
        }
    }

    /**
     * Updates the match(es) following the current match based on this match results.
     * @param match Input of the update.
     */
    private async updateNext(match: Match, roundNumber: number, inWinnerBracket: boolean, inLoserBracket: boolean) {
        const nextMatches = await this.getNextMatches(match, roundNumber, inWinnerBracket, inLoserBracket);
        if (nextMatches.length === 0) return;

        const winnerSide = helpers.getMatchResult(match);
        if (match.status === Status.Completed && !winnerSide) throw Error('Cannot find a winner.');

        if (winnerSide)
            this.setNext(match, nextMatches, winnerSide);
        else
            this.resetNext(match, nextMatches);
    }

    /**
     * Sets the participants and status in the match(es) following a match.
     * @param match The current match.
     * @param nextMatches The next match(es).
     * @param winnerSide The side of the winner in the current match.
     */
    private setNext(match: Match, nextMatches: Match[], winnerSide: Side) {
        const nextSide = helpers.getSide(match);
        helpers.setNextOpponent(match, nextMatches, 0, winnerSide, nextSide);
        this.storage.update('match', nextMatches[0].id, nextMatches[0]);

        if (nextMatches.length === 2) {
            helpers.setNextOpponent(match, nextMatches, 1, helpers.getOtherSide(winnerSide), winnerSide);
            this.storage.update('match', nextMatches[1].id, nextMatches[1]);
        }
    }

    /**
     * Resets the participants and status in the match(es) following a match.
     * @param match The current match.
     * @param nextMatches The next match(es).
     */
    private resetNext(match: Match, nextMatches: Match[]) {
        const nextSide = helpers.getSide(match);
        helpers.resetNextOpponent(nextMatches, 0, nextSide);
        this.storage.update('match', nextMatches[0].id, nextMatches[0]);

        if (nextMatches.length === 2) {
            helpers.resetNextOpponent(nextMatches, 1, nextSide);
            this.storage.update('match', nextMatches[1].id, nextMatches[1]);
        }
    }

    /**
     * Gets the number of a round based on its id.
     * @param roundId ID of the round.
     */
    private async getRoundNumber(roundId: number): Promise<number> {
        const round = await this.storage.select<Round>('round', roundId);
        if (!round) throw Error('Round not found.');
        return round.number;
    }

    /**
     * Gets the matches leading to the given match.
     * @param match The current match.
     */
    private async getPreviousMatches(match: Match, roundNumber: number, inLoserBracket: boolean): Promise<Match[]> {
        if (inLoserBracket) {
            const winnerBracket = await this.getWinnerBracket(match.stage_id);
            return await this.getPreviousMatchesLB(roundNumber, winnerBracket.id, match.number, match.group_id);
        }

        if (roundNumber === 1) {
            return []; // The match is in the first round of an upper bracket.
        }

        return await this.getMatchesBeforeMajorRound(roundNumber, match.group_id, match.number);
    }

    /**
     * Gets the matches leading to a given match from the loser bracket. 
     * @param roundNumber Number of the current round.
     * @param winnerBracketId ID of the winner bracket.
     * @param matchNumber Number of the current match.
     * @param groupId ID of the current group.
     */
    private async getPreviousMatchesLB(roundNumber: number, winnerBracketId: number, matchNumber: number, groupId: number) {
        const roundNumberWB = Math.ceil((roundNumber + 1) / 2);

        if (roundNumber === 1)
            return await this.getMatchesBeforeFirstRoundLB(winnerBracketId, matchNumber, roundNumberWB);

        if (roundNumber % 2 === 0)
            return await this.getMatchesBeforeMinorRoundLB(roundNumber, winnerBracketId, matchNumber, roundNumberWB, groupId);

        return await this.getMatchesBeforeMajorRound(roundNumber, groupId, matchNumber);
    }

    /**
     * Gets the matches leading to a given match in a major round.
     * @param roundNumber Number of the current round.
     * @param groupId ID of the current group.
     * @param matchNumber Number of the current match.
     */
    private async getMatchesBeforeMajorRound(roundNumber: number, groupId: number, matchNumber: number) {
        return [
            await this.findMatch(groupId, roundNumber - 1, matchNumber * 2 - 1),
            await this.findMatch(groupId, roundNumber - 1, matchNumber * 2),
        ];
    }

    /**
     * Gets the matches leading to a given match in the first round of the loser bracket.
     * @param winnerBracketId ID of the winner bracket.
     * @param matchNumber Number of the current match.
     * @param roundNumberWB The number of the previous round in the winner bracket.
     */
    private async getMatchesBeforeFirstRoundLB(winnerBracketId: number, matchNumber: number, roundNumberWB: number) {
        return [
            await this.findMatch(winnerBracketId, roundNumberWB, matchNumber * 2 - 1),
            await this.findMatch(winnerBracketId, roundNumberWB, matchNumber * 2),
        ];
    }

    /**
     * Gets the matches leading to a given match in a minor round of the loser bracket.
     * @param roundNumber Number of the current round.
     * @param winnerBracketId ID of the winner bracket.
     * @param matchNumber Number of the current match.
     * @param roundNumberWB The number of the previous round in the winner bracket.
     * @param groupId ID of the current group.
     */
    private async getMatchesBeforeMinorRoundLB(roundNumber: number, winnerBracketId: number, matchNumber: number, roundNumberWB: number, groupId: number) {
        return [
            await this.findMatch(winnerBracketId, roundNumberWB, matchNumber),
            await this.findMatch(groupId, roundNumber - 1, matchNumber),
        ];
    }

    /**
     * Gets the match(es) where the opponents of the current match will go just after.
     * @param match The current match.
     * @param roundNumber The number of the current round.
     * @param inWinnerBracket Whether the match is in the winner bracket.
     * @param inLoserBracket Whether the match is in the loser bracket.
     */
    private async getNextMatches(match: Match, roundNumber: number, inWinnerBracket: boolean, inLoserBracket: boolean): Promise<Match[]> {
        if (inLoserBracket)
            return await this.getNextMatchesLB(match, roundNumber);

        if (inWinnerBracket)
            return await this.getNextMatchesWB(match, roundNumber);

        return await this.getNextMatchesUpperBracket(match, roundNumber);
    }

    /**
     * Gets the match(es) where the opponents of the current match of winner bracket will go just after.
     * @param match The current match.
     * @param roundNumber The number of the current round.
     */
    private async getNextMatchesWB(match: Match, roundNumber: number) {
        const loserBracket = await this.getLoserBracket(match.stage_id);
        const roundNumberLB = roundNumber > 1 ? (roundNumber - 1) * 2 : 1;
        const matchNumberLB = roundNumber > 1 ? match.number : Math.ceil(match.number / 2);

        return [
            ...await this.getNextMatchesUpperBracket(match, roundNumber),
            await this.findMatch(loserBracket.id, roundNumberLB, matchNumberLB),
        ];
    }

    /**
     * Gets the match(es) where the opponents of the current match of a single elimination stage's bracket will go just after.
     * @param match The current match.
     * @param roundNumber The number of the current round.
     */
    private async getNextMatchesUpperBracket(match: Match, roundNumber: number): Promise<Match[]> {
        return [await this.findMatch(match.group_id, roundNumber + 1, Math.ceil(match.number / 2))];
    }

    /**
     * Gets the match(es) where the opponents of the current match of loser bracket will go just after.
     * @param match The current match.
     * @param roundNumber The number of the current round.
     */
    private async getNextMatchesLB(match: Match, roundNumber: number) {
        if (roundNumber % 2 === 1)
            return await this.getMatchesAfterMajorRoundLB(match, roundNumber);

        return await this.getMatchesAfterMinorRoundLB(match, roundNumber);
    }

    /**
     * Gets the match(es) where the opponents of the current match of a winner bracket's major round will go just after.
     * @param match The current match.
     * @param roundNumber The number of the current round.
     */
    private async getMatchesAfterMajorRoundLB(match: Match, roundNumber: number): Promise<Match[]> {
        return [await this.findMatch(match.group_id, roundNumber + 1, match.number)];
    }

    /**
     * Gets the match(es) where the opponents of the current match of a winner bracket's minor round will go just after.
     * @param match The current match.
     * @param roundNumber The number of the current round.
     */
    private async getMatchesAfterMinorRoundLB(match: Match, roundNumber: number): Promise<Match[]> {
        return [await this.findMatch(match.group_id, roundNumber + 1, Math.ceil(match.number / 2))];
    }

    /**
     * Returns what is needed to update a match.
     * @param matchId ID of the match.
     */
    private async getMatchData(matchId: number) {
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
     * @param stageId ID of the stage.
     */
    private async getUpperBracketFirstRound(stageId: number) {
        // Considering the database is ordered, this round will always be the first round of the upper bracket.
        const firstRound = await this.storage.selectFirst<Round>('round', { stage_id: stageId, number: 1 });
        if (!firstRound) throw Error('Round not found.');
        return firstRound;
    }

    /**
     * Gets the winner bracket.
     * @param stageId ID of the stage.
     */
    private async getWinnerBracket(stageId: number) {
        const winnerBracket = await this.storage.selectFirst<Group>('group', { stage_id: stageId, number: 1 });
        if (!winnerBracket) throw Error('Winner bracket not found.');
        return winnerBracket;
    }

    /**
     * Gets the loser bracket.
     * @param stageId ID of the stage.
     */
    private async getLoserBracket(stageId: number) {
        const loserBracket = await this.storage.selectFirst<Group>('group', { stage_id: stageId, number: 2 });
        if (!loserBracket) throw Error('Loser bracket not found.');
        return loserBracket;
    }

    /**
     * Finds a match in a given group. The match must have the given number in a round of which the number in group is given.
     * 
     * **Example:** In group of id 1, give me the 4th match in the 3rd round.
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
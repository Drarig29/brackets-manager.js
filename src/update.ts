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
        if (match.id === undefined) throw Error('No match id given.');

        const stored = await this.storage.select<Match>('match', match.id);
        if (!stored) throw Error('Match not found.');

        const inRoundRobin = await this.isRoundRobin(stored.stage_id);
        if (!inRoundRobin && helpers.isMatchUpdateLocked(stored)) throw Error('The match is locked.');

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
        if (matchId === undefined) throw Error('No match id given.');

        const stored = await this.storage.select<Match>('match', matchId);
        if (!stored) throw Error('Match not found.');

        const inRoundRobin = await this.isRoundRobin(stored.stage_id);
        if (!inRoundRobin && helpers.isMatchUpdateLocked(stored)) throw Error('The match is locked.');

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
     * Updates the seeding of a stage.
     * @param stageId ID of the stage.
     * @param seeding The new seeding.
     */
    public async seeding(stageId: number, seeding: Seeding | SeedingIds) {
        return this.updateSeeding(stageId, seeding);
    }

    /**
     * Resets the seeding of a stage.
     * @param stageId ID of the stage.
     */
    public async resetSeeding(stageId: number) {
        return this.updateSeeding(stageId, null);
    }

    /**
     * Updates or resets the seeding of a stage.
     * @param stageId ID of the stage.
     * @param seeding A new seeding or null to reset the existing seeding.
     */
    private async updateSeeding(stageId: number, seeding: Seeding | SeedingIds | null) {
        const stage = await this.storage.select<Stage>('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        const create = new Create(this.storage, {
            name: stage.name,
            tournamentId: stage.tournament_id,
            type: stage.type,
            settings: stage.settings,
            seeding: seeding || undefined,
        }, true);

        const method = this.getSeedingOrdering(stage.type, create);
        const slots = await create.getSlots();

        const matches = await this.getSeedingMatches(stage.id, stage.type);
        if (!matches)
            throw Error('Error getting matches associated to the seeding.');

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
            return this.storage.select<Match>('match');

        const firstRound = await this.storage.selectFirst<Round>('round', { stage_id: stageId, number: 1 });
        if (!firstRound) throw Error('First round not found.');

        return this.storage.select<Match>('match', { round_id: firstRound.id });
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
     * Updates the seed ordering of a round.
     * @param id ID of the round.
     * @param method Seed ordering method.
     */
    public async roundOrdering(id: number, method: SeedOrdering) {
        const round = await this.storage.select<Round>('round', id);
        if (!round) throw Error('This round does not exist.');

        const inRoundRobin = await this.isRoundRobin(round.stage_id);
        if (inRoundRobin) throw Error('Impossible to update ordering in a round-robin stage.');

        const matches = await this.storage.select<Match>('match', { round_id: id });
        if (!matches) throw Error('This round has no match.');

        if (matches.some(match => match.status > Status.Ready))
            throw Error('At least one match has started or is completed.');

        const inLoserBracket = await this.isLoserBracket(round.group_id);
        const seeds = helpers.getSeeds(inLoserBracket, round.number, matches.length);
        const positions = ordering[method](seeds);

        await this.updateRoundOrdering(round, matches, positions);
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
     * @param round The round to update.
     * @param matches The matches of the round.
     * @param positions The new positions.
     */
    private async updateRoundOrdering(round: Round, matches: Match[], positions: number[]) {
        for (const match of matches) {
            const updated = { ...match }; // Create a copy of the match... workaround for node-json-db, which returns a reference to data.
            updated.opponent1 = helpers.findPosition(matches, positions.shift()!);

            if (round.number === 1)
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

        const inWinnerBracket = await this.isWinnerBracket(stored.group_id);
        const inLoserBracket = await this.isLoserBracket(stored.group_id);

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

        return await this.getNextMatchesSingleBracket(match, roundNumber);
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
            ...await this.getNextMatchesSingleBracket(match, roundNumber),
            await this.findMatch(loserBracket.id, roundNumberLB, matchNumberLB),
        ];
    }

    /**
     * Gets the match(es) where the opponents of the current match of a single elimination stage's bracket will go just after.
     * @param match The current match.
     * @param roundNumber The number of the current round.
     */
    private async getNextMatchesSingleBracket(match: Match, roundNumber: number): Promise<Match[]> {
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
     * Checks if a stage is a round-robin stage.
     * @param stageId ID of the stage.
     */
    private async isRoundRobin(stageId: number): Promise<boolean> {
        const stage = await this.storage.select<Stage>('stage', stageId);
        if (!stage) throw Error('Stage not found.');
        return stage.type === 'round_robin';
    }

    /**
     * Checks if a group is a winner bracket.
     * 
     * It's not always the opposite of `inLoserBracket()`: it could be the only bracket of a single elimination stage.
     * @param groupId ID of the group.
     */
    private async isWinnerBracket(groupId: number): Promise<boolean> {
        const group = await this.storage.select<Group>('group', groupId);
        if (!group) throw Error('Group not found.');
        return group.number === 1;
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
     * Checks if a group is a loser bracket.
     * @param groupId ID of the group.
     */
    private async isLoserBracket(groupId: number): Promise<boolean> {
        const group = await this.storage.select<Group>('group', groupId);
        if (!group) throw Error('Group not found.');
        return group.number === 2;
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
     * Finds a match in a given group. The match must have the given number in a round which number in group is given.
     * 
     * **Example:** In group of id 1, give me the 4th match in the 3rd round.
     * @param group ID of the group.
     * @param roundNumber Number of the round in its parent group.
     * @param matchNumber Number of the match in its parent round.
     */
    private async findMatch(group: number, roundNumber: number, matchNumber: number): Promise<Match> {
        const round = await this.storage.select<Round>('round', {
            group_id: group,
            number: roundNumber,
        });

        if (!round || round.length === 0) throw Error('This round does not exist.');

        const match = await this.storage.select<Match>('match', {
            round_id: round[0].id,
            number: matchNumber,
        });

        if (!match || match.length === 0) throw Error('This match does not exist.');
        return match[0];
    }
}
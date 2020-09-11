import { Match, Round, Group, Stage, MatchGame, SeedOrdering, MatchResults, Seeding, SeedingIds } from "brackets-model";
import { ordering } from './ordering';
import { IStorage } from "./storage";
import * as helpers from './helpers';
import { Create } from "./create";

export type Level = 'stage' | 'group' | 'round' | 'match';

const WINNER_BRACKET_NAME = 'Winner Bracket';
const LOSER_BRACKET_NAME = 'Loser Bracket';

export class Update {

    private storage: IStorage;

    constructor(storage: IStorage) {
        this.storage = storage;
    }

    /**
     * Updates partial information of a match. It's id must be given.
     * 
     * This will trigger an update in the next match.
     * @param match Values to change in a match.
     */
    public async match(match: Partial<Match>) {
        if (match.id === undefined) throw Error('No match id given.');

        const stored = await this.storage.select<Match>('match', match.id);
        if (!stored) throw Error('Match not found.');

        const inRoundRobin = await this.isRoundRobin(stored.stage_id);
        if (!inRoundRobin && await this.isMatchLocked(stored)) throw Error('The match is locked.');

        const completed = await this.updateMatchResults(stored, match);
        await this.storage.update('match', match.id, stored);

        if (!inRoundRobin && completed) {
            await this.updateNext(stored);
        }
    }

    /**
     * Updates partial information of a match game. It's id must be given.
     * 
     * This will trigger an update in the parent match.
     * @param game Values to change in a match game.
     */
    public async matchGame(game: Partial<MatchGame>) {
        if (game.id === undefined) throw Error('No match game id given.');

        const stored = await this.storage.select<MatchGame>('match_game', game.id);
        if (!stored) throw Error('Match game not found.');

        await this.updateMatchResults(stored, game);
        await this.storage.update('match_game', game.id, stored);

        const storedParent = await this.storage.select<Match>('match', stored.parent_id);
        if (!storedParent) throw Error('Parent not found.');

        const scores = await this.getGamesResults(stored.parent_id);
        const parent: Partial<MatchResults> = {
            opponent1: {
                id: storedParent.opponent1 && storedParent.opponent1.id,
                score: scores.opponent1,
            },
            opponent2: {
                id: storedParent.opponent2 && storedParent.opponent2.id,
                score: scores.opponent2,
            }
        };

        const parentCompleted = scores.opponent1 + scores.opponent2 === storedParent.child_count;
        if (parentCompleted) {
            if (scores.opponent1 > scores.opponent2)
                parent.opponent1!.result = 'win';
            else if (scores.opponent2 > scores.opponent1)
                parent.opponent2!.result = 'win';
            else
                throw Error('Match games result in a tie for the parent match.');
        }

        this.updateMatchResults(storedParent, parent);

        await this.storage.update('match', storedParent.id, storedParent);
    }

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

        return create.run();
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

        if (matches.some(match => match.status !== 'pending'))
            throw Error('At least one match has started or is completed.')

        const inLoserBracket = await this.isGroupOfName(round.group_id, LOSER_BRACKET_NAME);

        if ((!inLoserBracket && round.number !== 1) || // Upper bracket and not round 1.
            (inLoserBracket && !(round.number === 1 || round.number % 2 === 0))) // Loser bracket and not round 1 or not minor round.
            throw Error('This round does not support ordering.');

        const seedCount = round.number === 1 ?
            matches.length * 2 : // Two per match for upper or lower bracket round 1.
            matches.length; // One per match for loser bracket minor rounds.

        const seeds = Array.from(Array(seedCount), (_, i) => i + 1);
        const positions = ordering[method](seeds);

        for (const match of matches) {
            const updated = { ...match }; // Create a copy.
            updated.opponent1 = helpers.findPosition(matches, positions.shift()!);

            if (round.number === 1)
                updated.opponent2 = helpers.findPosition(matches, positions.shift()!);

            await this.storage.update<Match>('match', updated.id, updated);
        }
    }

    /**
     * Updates child count of all matches of a given level.
     * @param level The level at which to act.
     * @param id The id of the chosen level.
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
                status: 'pending',
                scheduled_datetime: null,
                start_datetime: null,
                end_datetime: null,
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
     * Calculates the score of a parent match based on its child games.
     * @param parentId ID of the parent match.
     */
    private async getGamesResults(parentId: number) {
        const games = await this.storage.select<MatchGame>('match_game', { parent_id: parentId });
        if (!games) throw Error('No match games.');

        const scores = {
            opponent1: 0,
            opponent2: 0,
        }

        for (const game of games) {
            const result = helpers.getMatchResult(game);
            if (result === 'opponent1') scores.opponent1++;
            else if (result === 'opponent2') scores.opponent2++;
        }

        return scores;
    }

    /**
     * Updates a match results based on an input.
     * @param stored A reference to what will be updated in the storage.
     * @param match Input of the update.
     */
    private async updateMatchResults(stored: MatchResults, match: Partial<MatchResults>) {
        const completed = helpers.isMatchCompleted(match);
        if (match.status === 'completed' && !completed) throw Error('The match is not really completed.');

        helpers.setScores(stored, match);

        if (completed) {
            helpers.setCompleted(stored, match);
        } else if (helpers.isMatchCompleted(stored)) {
            helpers.removeCompleted(stored);
        }

        return completed;
    }

    /**
     * Updates match(es) following the current match based on this match results.
     * @param match Input of the update.
     */
    private async updateNext(match: Match) {
        const nextMatches = await this.getNextMatches(match);
        if (nextMatches.length === 0) return;

        const side = helpers.getSide(match);
        const winner = helpers.getMatchResult(match);
        if (!winner) throw Error('Cannot find a winner.');

        nextMatches[0][side] = helpers.getOpponent(match, winner);
        this.storage.update('match', nextMatches[0].id, nextMatches[0]);

        if (nextMatches.length === 2) {
            nextMatches[1][side] = helpers.getOpponent(match, helpers.getOtherSide(winner));
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
     * Checks if a match is locked.
     * 
     * One of these situations may lock the match:
     * 
     * - The matches leading to the locked match have not been completed yet.
     * - One of the participants from the locked match has already played its following match.
     * @param match The match to check.
     */
    private async isMatchLocked(match: Match): Promise<boolean> {
        const previousMatches = await this.getPreviousMatches(match);

        if (previousMatches.length === 2 &&
            (!helpers.isMatchCompleted(previousMatches[0]) || !helpers.isMatchCompleted(previousMatches[1])))
            return true; // Previous matches not completed yet.

        const nextMatches = await this.getNextMatches(match);

        if (nextMatches.length === 0)
            return false; // No following match.

        if (nextMatches.length === 1 && helpers.isMatchCompleted(nextMatches[0]))
            return true; // Next match already completed.

        if (nextMatches.length === 2 &&
            (helpers.isMatchCompleted(nextMatches[0]) || helpers.isMatchCompleted(nextMatches[1])))
            return true; // Next matches already completed.

        return false;
    }

    /**
     * Gets matches leading to the given match.
     * @param match The current match.
     */
    private async getPreviousMatches(match: Match): Promise<Match[]> {
        const inLoserBracket = await this.isGroupOfName(match.group_id, LOSER_BRACKET_NAME);
        const roundNumber = await this.getRoundNumber(match.round_id);

        if (inLoserBracket) {
            const winnerBracket = await this.findGroupByName(match.stage_id, WINNER_BRACKET_NAME);
            const roundNumberWB = Math.ceil((roundNumber + 1) / 2);

            if (roundNumber === 1) { // First major round.
                return [
                    await this.findMatch(winnerBracket.id, roundNumberWB, match.number * 2 - 1),
                    await this.findMatch(winnerBracket.id, roundNumberWB, match.number * 2),
                ];
            } else if (roundNumber % 2 === 1) { // Minor rounds.
                return [
                    await this.findMatch(winnerBracket.id, roundNumberWB, match.number),
                    await this.findMatch(match.group_id, roundNumber - 1, match.number),
                ];
            }
        }

        if (roundNumber === 1) {
            return []; // The match is in the first round of the upper bracket.
        }

        return [
            await this.findMatch(match.group_id, roundNumber - 1, match.number * 2 - 1),
            await this.findMatch(match.group_id, roundNumber - 1, match.number * 2),
        ];
    }

    /**
     * Gets match(es) where the opponents of the current match will go just after.
     * @param match The current match.
     */
    private async getNextMatches(match: Match): Promise<Match[]> {
        const matches: Match[] = [];

        const roundNumber = await this.getRoundNumber(match.round_id);

        // Not always the opposite of "inLoserBracket". Could be in simple elimination.
        const inWinnerBracket = await this.isGroupOfName(match.group_id, WINNER_BRACKET_NAME);
        const inLoserBracket = await this.isGroupOfName(match.group_id, LOSER_BRACKET_NAME);

        if (inLoserBracket && roundNumber % 2 === 1) { // Major rounds.
            matches.push(await this.findMatch(match.group_id, roundNumber + 1, match.number));
        } else { // Upper bracket rounds or lower bracket minor rounds.
            matches.push(await this.findMatch(match.group_id, roundNumber + 1, Math.ceil(match.number / 2)));
        }

        if (inWinnerBracket) {
            const loserBracket = await this.findGroupByName(match.stage_id, LOSER_BRACKET_NAME);
            const roundNumberLB = roundNumber > 1 ? (roundNumber - 1) * 2 : 1;
            const matchNumberLB = roundNumber > 1 ? match.number : Math.ceil(match.number / 2);
            matches.push(await this.findMatch(loserBracket.id, roundNumberLB, matchNumberLB));
        }

        return matches;
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
     * Finds a group by its name.
     * @param name Name to find.
     */
    private async findGroupByName(stageId: number, name: string): Promise<Group> {
        const group = await this.storage.select<Group>('group', { stage_id: stageId, name });
        if (!group || group.length === 0) throw Error('Group not found.');
        return group[0];
    }

    /**
     * Checks if a group has the given name.
     * @param groupId ID of the group.
     * @param name Name to check.
     */
    private async isGroupOfName(groupId: number, name: string): Promise<boolean> {
        const group = await this.storage.select<Group>('group', groupId);
        if (!group) throw Error('Group not found.');
        return group.name === name;
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
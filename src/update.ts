import { Match, Result, Round, Group, Stage, MatchGame, SeedOrdering, ParticipantResult, MatchResults } from "brackets-model";
import { IStorage } from "./storage";
import * as helpers from './helpers';

export type Level = 'stage' | 'group' | 'round' | 'match';

export class Update {

    private storage: IStorage;

    constructor(storage: IStorage) {
        this.storage = storage;
    }

    public async roundOrdering(id: number, method: SeedOrdering) {
        const round = await this.storage.select<Round>('round', id);
        if (!round) throw Error('This round does not exist.');

        const inRoundRobin = await this.isRoundRobin(round.stage_id);
        if (inRoundRobin) throw Error('Impossible to update ordering in a round-robin stage.');

        const matches = await this.storage.select<Match>('match', { round_id: id });
        if (!matches) throw Error('This round has no match.');

        if (matches.some(match => match.status !== 'pending'))
            throw Error('At least one match has started or is completed.')

        const inLoserBracket = await this.isLoserBracket(round.group_id);

        if ((!inLoserBracket && round.number !== 1) || // Upper bracket and not round 1.
            (inLoserBracket && !(round.number === 1 || round.number % 2 === 0))) // Loser bracket and not round 1 or not minor round.
            throw Error('This round does not support ordering.');

        const seedCount = round.number === 1 ? matches.length * 2 : matches.length;
        const seeds = Array.from(Array(seedCount), (_, i) => i + 1);
        const ordered = helpers.ordering[method](seeds);

        for (const match of matches) {
            const updated = { ...match };
            updated.opponent1 = this.findPosition(matches, ordered.shift()!);

            if (round.number === 1)
                updated.opponent2 = this.findPosition(matches, ordered.shift()!);

            await this.storage.update<Match>('match', updated.id, updated);
        }
    }

    private findPosition(matches: Match[], position: number): ParticipantResult | null {
        for (const match of matches) {
            if (match.opponent1 && match.opponent1.position === position)
                return match.opponent1;

            if (match.opponent2 && match.opponent2.position === position)
                return match.opponent2;
        }

        return null;
    }

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

    private async updateStageMatchChildCount(id: number, childCount: number) {
        await this.storage.update<Match>('match', { stage_id: id }, { child_count: childCount });

        const matches = await this.storage.select<Match>('match', { stage_id: id });
        if (!matches) throw Error('This stage has no match.');

        for (const match of matches)
            await this.updateMatchChildCount(match.id, childCount);
    }

    private async updateGroupMatchChildCount(id: number, childCount: number) {
        await this.storage.update<Match>('match', { group_id: id }, { child_count: childCount });

        const matches = await this.storage.select<Match>('match', { group_id: id });
        if (!matches) throw Error('This group has no match.');

        for (const match of matches)
            await this.updateMatchChildCount(match.id, childCount);
    }

    private async updateRoundMatchChildCount(id: number, childCount: number) {
        await this.storage.update<Match>('match', { round_id: id }, { child_count: childCount });

        const matches = await this.storage.select<Match>('match', { round_id: id });
        if (!matches) throw Error('This round has no match.');

        for (const match of matches)
            await this.updateMatchChildCount(match.id, childCount);
    }

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

    public async matchGame(game: Partial<MatchGame>) {
        if (game.id === undefined) throw Error('No match game id given.');

        const stored = await this.storage.select<MatchGame>('match_game', game.id);
        if (!stored) throw Error('Match game not found.');

        await this.updateMatchResults(stored, game);
        await this.storage.update('match_game', game.id, stored);

        const games = await this.storage.select<MatchGame>('match_game', { parent_id: stored.parent_id });
        if (!games) throw Error('No match games.');

        const results = games.map(game => helpers.getMatchResults(game));
        const scores = {
            opponent1: 0,
            opponent2: 0,
        }

        for (const result of results) {
            if (result === 'opponent1') scores.opponent1++;
            else if (result === 'opponent2') scores.opponent2++;
        }

        const storedParent = await this.storage.select<Match>('match', stored.parent_id);
        if (!storedParent) throw Error('Parent not found.');

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

    private async updateMatchResults(stored: MatchResults, match: Partial<MatchResults>) {
        const completed = helpers.isMatchCompleted(match);
        if (match.status === 'completed' && !completed) throw Error('The match is not really completed.');

        this.setGeneric(stored, match);

        if (completed) {
            this.setCompleted(stored, match);
        } else if (helpers.isMatchCompleted(stored)) {
            this.removeCompleted(stored);
        }

        return completed;
    }

    private setGeneric(stored: MatchResults, match: Partial<MatchResults>) {
        if ((!match.opponent1 || match.opponent1.score === undefined) &&
            (!match.opponent2 || match.opponent2.score === undefined)) {
            // No score update.
            if (match.status) stored.status = match.status;
            return;
        }

        if (!stored.opponent1 || !stored.opponent2) throw Error('No team is defined yet. Can\'t set the score.');

        // Default as soon as scores are updated.
        stored.status = 'running';
        stored.opponent1.score = 0;
        stored.opponent2.score = 0;

        if (match.opponent1 && match.opponent1.score !== undefined)
            stored.opponent1.score = match.opponent1.score;

        if (match.opponent2 && match.opponent2.score !== undefined)
            stored.opponent2.score = match.opponent2.score;
    }

    private setCompleted(stored: MatchResults, match: Partial<MatchResults>) {
        stored.status = 'completed';

        this.setResults(stored, match, 'win', 'loss');
        this.setResults(stored, match, 'loss', 'win');
        this.setResults(stored, match, 'draw', 'draw');

        this.setForfeits(stored, match);
    }

    private removeCompleted(stored: MatchResults) {
        stored.status = 'running';

        if (stored.opponent1) stored.opponent1.forfeit = undefined;
        if (stored.opponent1) stored.opponent1.result = undefined;
        if (stored.opponent2) stored.opponent2.forfeit = undefined;
        if (stored.opponent2) stored.opponent2.result = undefined;
    }

    private setResults(stored: MatchResults, match: Partial<MatchResults>, check: Result, change: Result) {
        if (match.opponent1 && match.opponent2) {
            if ((match.opponent1.result === 'win' && match.opponent2.result === 'win') ||
                (match.opponent1.result === 'loss' && match.opponent2.result === 'loss')) {
                throw Error('There are two winners.');
            }

            if (match.opponent1.forfeit === true && match.opponent2.forfeit === true) {
                throw Error('There are two forfeits.');
            }
        }

        // Add both the query result and the resulting result.

        if (match.opponent1 && match.opponent1.result === check) {
            if (stored.opponent1) stored.opponent1.result = check;
            else stored.opponent1 = { id: null, result: check };

            if (stored.opponent2) stored.opponent2.result = change;
            else stored.opponent2 = { id: null, result: change };
        }

        if (match.opponent2 && match.opponent2.result === check) {
            if (stored.opponent2) stored.opponent2.result = check;
            else stored.opponent2 = { id: null, result: check };

            if (stored.opponent1) stored.opponent1.result = change;
            else stored.opponent1 = { id: null, result: change };
        }
    }

    private setForfeits(stored: MatchResults, match: Partial<MatchResults>) {
        // The forfeiter doesn't have a loss result.

        if (match.opponent1 && match.opponent1.forfeit === true) {
            if (stored.opponent1) stored.opponent1.forfeit = true;

            if (stored.opponent2) stored.opponent2.result = 'win';
            else stored.opponent2 = { id: null, result: 'win' };
        }

        if (match.opponent2 && match.opponent2.forfeit === true) {
            if (stored.opponent2) stored.opponent2.forfeit = true;

            if (stored.opponent1) stored.opponent1.result = 'win';
            else stored.opponent1 = { id: null, result: 'win' };
        }
    }

    private async updateNext(match: Match) {
        const nextMatches = await this.getNextMatches(match);
        if (nextMatches.length === 0) return;

        const side = helpers.getSide(match);
        const winner = helpers.getMatchResults(match);
        if (!winner) throw Error('Cannot find a winner.');

        nextMatches[0][side] = helpers.getOpponent(match, winner);
        this.storage.update('match', nextMatches[0].id, nextMatches[0]);

        if (nextMatches.length === 2) {
            nextMatches[1][side] = helpers.getOpponent(match, helpers.otherSide(winner));
            this.storage.update('match', nextMatches[1].id, nextMatches[1]);
        }
    }

    private async getRoundNumber(roundId: number): Promise<number> {
        const round = await this.storage.select<Round>('round', roundId);
        if (!round) throw Error('Round not found.');
        return round.number;
    }

    /**
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

    private async getPreviousMatches(match: Match): Promise<Match[]> {
        const inLoserBracket = await this.isLoserBracket(match.group_id);
        const roundNumber = await this.getRoundNumber(match.round_id);

        if (inLoserBracket) {
            const winnerBracket = await this.findWinnerBracket();
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

    private async getNextMatches(match: Match): Promise<Match[]> {
        const matches: Match[] = [];

        const roundNumber = await this.getRoundNumber(match.round_id);

        // Not always the opposite of "inLoserBracket". Could be in simple elimination.
        const inWinnerBracket = await this.isWinnerBracket(match.group_id);
        const inLoserBracket = await this.isLoserBracket(match.group_id);

        if (inLoserBracket && roundNumber % 2 === 1) { // Major rounds.
            matches.push(await this.findMatch(match.group_id, roundNumber + 1, match.number));
        } else { // Upper bracket rounds or lower bracket minor rounds.
            matches.push(await this.findMatch(match.group_id, roundNumber + 1, Math.ceil(match.number / 2)));
        }

        if (inWinnerBracket) {
            const loserBracket = await this.findLoserBracket();
            const roundNumberLB = roundNumber > 1 ? (roundNumber - 1) * 2 : 1;
            const matchNumberLB = roundNumber > 1 ? match.number : Math.ceil(match.number / 2);
            matches.push(await this.findMatch(loserBracket.id, roundNumberLB, matchNumberLB));
        }

        return matches;
    }

    private async findWinnerBracket(): Promise<Group> {
        const group = await this.storage.select<Group>('group', { name: 'Winner Bracket' });
        if (!group || group.length === 0) throw Error('Group not found.');
        return group[0];
    }

    private async findLoserBracket(): Promise<Group> {
        const group = await this.storage.select<Group>('group', { name: 'Loser Bracket' });
        if (!group || group.length === 0) throw Error('Group not found.');
        return group[0];
    }

    private isWinnerBracket(groupId: number): Promise<boolean> {
        return this.isGroupOfName(groupId, 'Winner Bracket');
    }

    private isLoserBracket(groupId: number): Promise<boolean> {
        return this.isGroupOfName(groupId, 'Loser Bracket');
    }

    private async isRoundRobin(stageId: number): Promise<boolean> {
        const stage = await this.storage.select<Stage>('stage', stageId);
        if (!stage) throw Error('Stage not found.');
        return stage.type === 'round_robin';
    }

    private async isGroupOfName(groupId: number, name: string): Promise<boolean> {
        const group = await this.storage.select<Group>('group', groupId);
        if (!group) throw Error('Group not found.');
        return group.name === name;
    }

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
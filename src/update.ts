import { Match, Result, Round } from "brackets-model";
import { IStorage } from "./storage";
import { BracketsManager } from ".";
import * as helpers from './helpers';

export async function updateMatch(this: BracketsManager, values: Partial<Match>, updateNext: boolean) {
    const update = new Update(this.storage);
    await update.match(values, updateNext);
}

class Update {

    private storage: IStorage;

    constructor(storage: IStorage) {
        this.storage = storage;
    }

    // TODO: lock the match when it's not determined. Can't set the score, the result nor the forfeit.

    public async match(match: Partial<Match>, updateNext: boolean) {
        if (match.id === undefined) throw Error('No match id given.');

        const stored = await this.storage.select<Match>('match', match.id);
        if (!stored) throw Error('Match not found.');

        const completed = helpers.isMatchCompleted(match);
        if (match.status === 'completed' && !completed) throw Error('The match is not really completed.');

        // TODO: handle setting forfeit to false / removing complete status... etc.

        this.setGeneric(stored, match);

        if (completed) {
            this.setCompleted(stored, match);
        }

        await this.storage.update('match', match.id, stored);

        if (completed && updateNext) {
            await this.updateNextMatch(stored);
        }
    }

    private setGeneric(stored: Match, match: Partial<Match>) {
        if (match.status) stored.status = match.status;

        if (match.opponent1 && match.opponent1.score) {
            if (!stored.opponent1) throw Error('No team is defined yet. Can\'t set the score.');
            stored.opponent1.score = match.opponent1.score;
        }

        if (match.opponent2 && match.opponent2.score) {
            if (!stored.opponent2) throw Error('No team is defined yet. Can\'t set the score.');
            stored.opponent2.score = match.opponent2.score;
        }
    }

    private setCompleted(stored: Match, match: Partial<Match>) {
        stored.status = 'completed';

        this.setResults(stored, match, 'win', 'loss');
        this.setResults(stored, match, 'loss', 'win');
        this.setResults(stored, match, 'draw', 'draw');

        this.setForfeits(stored, match);
    }

    private setResults(stored: Match, match: Partial<Match>, check: Result, change: Result) {
        if (match.opponent1 && match.opponent2) {
            if ((match.opponent1.result === 'win' && match.opponent2.result === 'win') ||
                (match.opponent1.result === 'loss' && match.opponent2.result === 'loss')) {
                throw Error('There are two winners.');
            }

            if (match.opponent1.forfeit === true && match.opponent2.forfeit === true) {
                throw Error('There are two forfeits.'); // TODO: handle this scenario.
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

    private setForfeits(stored: Match, match: Partial<Match>) {
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

    private async updateNextMatch(match: Match) {
        const next = await this.findNextMatch(match);
        const winner = helpers.getWinner(match);
        next[helpers.getSide(match)] = { id: winner };
        this.storage.update('match', next.id, next);
    }

    private async findNextMatch(match: Match): Promise<Match> {
        return this.findMatch(match.stage_id, match.group_id, await this.getRoundNumber(match.round_id) + 1, Math.ceil(match.number / 2));
    }

    private async getRoundNumber(roundId: number): Promise<number> {
        const round = await this.storage.select<Round>('round', roundId);
        if (!round) throw Error('Round not found.');
        return round.number;
    }

    // TODO: optimize the requests by getting previous and next rounds only once.

    /**
     * One of these situations may lock the match:
     * 
     * - One of the participants from the locked match has already played its following match.
     * - The matches leading to the locked match have not been completed yet.
     * @param match The match to check.
     */
    private async isMatchLocked(match: Match) {
        
    }

    private async findMatch(stage: number, group: number, roundNumber: number, matchNumber: number): Promise<Match> {
        const round = await this.storage.select<Round>('round', round =>
            round.stage_id === stage &&
            round.group_id === group &&
            round.number === roundNumber
        );

        if (!round) throw Error('This round does not exist.');

        const match = await this.storage.select<Match>('match', match =>
            match.stage_id === stage &&
            match.group_id === group &&
            match.round_id === round[0].id &&
            match.number === matchNumber
        );

        if (!match) throw Error('This match does not exist.');
        return match[0];
    }
}
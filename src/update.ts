import { Match, Result, Side, Round } from "brackets-model";
import { IStorage } from "./storage";
import { BracketsManager } from ".";

export function updateMatch(this: BracketsManager, values: Partial<Match>, updateNext: boolean) {
    const update = new Update(this.storage);
    update.match(values, updateNext);
}

class Update {
    storage: IStorage;

    constructor(storage: IStorage) {
        this.storage = storage;
    }

    // TODO: lock the match when it's not determined. Can't set the score, the result nor the forfeit.

    match(match: Partial<Match>, updateNext: boolean) {
        if (match.id === undefined) throw Error('No match id given.');

        const stored = this.storage.select<Match>('match', match.id);
        if (!stored) throw Error('Match not found.');

        const completed = Update.isMatchCompleted(match);

        // TODO: handle setting forfeit to false / removing complete status... etc.

        this.updateGeneric(stored, match);

        if (completed) {
            this.updateCompleted(stored, match);
        }

        this.storage.update('match', match.id, stored);

        if (completed && updateNext) {
            this.updateNextMatch(stored);
        }
    }

    private updateGeneric(stored: Match, match: Partial<Match>) {
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

    private updateCompleted(stored: Match, match: Partial<Match>) {
        stored.status = 'completed';

        this.updateResults(stored, match, 'win', 'loss');
        this.updateResults(stored, match, 'loss', 'win');
        this.updateResults(stored, match, 'draw', 'draw');

        this.updateForfeits(stored, match);
    }

    private updateForfeits(stored: Match, match: Partial<Match>) {
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

    private updateResults(stored: Match, match: Partial<Match>, check: Result, change: Result) {
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

    private updateNextMatch(match: Match) {
        const next = this.findNextMatch(match);
        const winner = Update.getWinner(match);
        next[Update.getSide(match)] = { id: winner };
        this.storage.update('match', next.id, next);
    }

    private findNextMatch(match: Match): Match {
        return this.findMatch(match.stage_id, match.group_id, this.getRoundNumber(match.round_id) + 1, Math.ceil(match.number / 2));
    }

    private getRoundNumber(roundId: number): number {
        const round = this.storage.select<Round>('round', roundId);
        if (!round) throw Error('Round not found.');
        return round.number;
    }

    private findMatch(stage: number, group: number, roundNumber: number, matchNumber: number): Match {
        const round = this.storage.select<Round>('round', round =>
            round.stage_id === stage &&
            round.group_id === group &&
            round.number === roundNumber
        );

        if (!round) throw Error('This round does not exist.');

        const match: Match[] | undefined = this.storage.select('match', match =>
            match.stage_id === stage &&
            match.group_id === group &&
            match.round_id === round[0].id &&
            match.number === matchNumber
        );

        if (!match) throw Error('This match does not exist.');
        return match[0];
    }

    private static getWinner(match: Match): number {
        let winner: number | null = null;

        if (match.opponent1 && match.opponent1.result === 'win') {
            winner = match.opponent1.id;
        }

        if (match.opponent2 && match.opponent2.result === 'win') {
            if (winner !== null) throw Error('There are two winners.')
            winner = match.opponent2.id;
        }

        if (winner === null) throw Error('No winner found.');
        return winner;
    }

    private static getSide(match: Match): Side {
        return match.number % 2 === 1 ? 'opponent1' : 'opponent2';
    }

    private static isMatchCompleted(match: Partial<Match>): boolean {
        return (!!match.opponent1 && (match.opponent1.result !== undefined || match.opponent1.forfeit !== undefined))
            || (!!match.opponent2 && (match.opponent2.result !== undefined || match.opponent2.forfeit !== undefined));
    }
}
import { db } from "./database";
import { Match, Result, Side, Round } from "brackets-model";

export function updateMatch(match: Partial<Match>, updateNext: boolean) {
    if (match.id === undefined) throw Error('No match id given.');

    const stored = db.select<Match>('match', match.id);
    const completed = isMatchCompleted(match);

    // TODO: handle setting forfeit to false / removing complete status... etc.

    updateGeneric(stored, match);

    if (completed) {
        updateCompleted(stored, match);
    }

    db.update('match', match.id, stored);

    if (completed && updateNext) {
        updateNextMatch(stored);
    }
}

// TODO: lock the match when it's not determined. Can't set the score, the result nor the forfeit.

function updateGeneric(stored: Match, match: Partial<Match>) {
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

function updateCompleted(stored: Match, match: Partial<Match>) {
    stored.status = 'completed';

    updateResults(stored, match, 'win', 'loss');
    updateResults(stored, match, 'loss', 'win');
    updateResults(stored, match, 'draw', 'draw');

    updateForfeits(stored, match);
}

function updateForfeits(stored: Match, match: Partial<Match>) {
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

function updateResults(stored: Match, match: Partial<Match>, check: Result, change: Result) {
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

function updateNextMatch(match: Match) {
    const next = findNextMatch(match);
    const winner = getWinner(match);
    next[getSide(match)] = { id: winner };
    db.update('match', next.id, next);
}

function findNextMatch(match: Match): Match {
    return findMatch(match.stage_id, match.group_id, getRoundNumber(match.round_id) + 1, Math.ceil(match.number / 2));
}

function getRoundNumber(roundId: number): number {
    return db.select<Round>('round', roundId).number;
}

function findMatch(stage: number, group: number, roundNumber: number, matchNumber: number): Match {
    const round = db.select<Round>('round', round =>
        round.stage_id === stage &&
        round.group_id === group &&
        round.number === roundNumber
    );

    if (!round) throw Error('This round does not exist.');

    const match: Match[] | undefined = db.select('match', match =>
        match.stage_id === stage &&
        match.group_id === group &&
        match.round_id === round[0].id &&
        match.number === matchNumber
    );

    if (!match) throw Error('This match does not exist.');
    return match[0];
}

function getWinner(match: Match): number {
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

function getSide(match: Match): Side {
    return match.number % 2 === 1 ? 'opponent1' : 'opponent2';
}

function isMatchCompleted(match: Partial<Match>): boolean {
    return (!!match.opponent1 && (match.opponent1.result !== undefined || match.opponent1.forfeit !== undefined))
        || (!!match.opponent2 && (match.opponent2.result !== undefined || match.opponent2.forfeit !== undefined));
}
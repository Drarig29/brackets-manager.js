import { db } from "./database";
import { Match, Result, Side } from "brackets-model";

export function updateMatch(match: Partial<Match>) {
    if (match.id === undefined) throw Error('No match id given.');

    const completed = isMatchCompleted(match);
    const updated = match;

    if (completed) {
        updateCompleted(match, updated);
    }

    db.update('match', match.id, updated);

    if (completed) {
        const merged = db.select('match', match.id);
        updateNext(merged);
    }
}

function isMatchCompleted(match: Partial<Match>): boolean {
    return (!!match.opponent1 && (match.opponent1.result !== undefined || match.opponent1.forfeit !== undefined))
        || (!!match.opponent2 && (match.opponent2.result !== undefined || match.opponent2.forfeit !== undefined));
}

function updateCompleted(input: Partial<Match>, output: Partial<Match>) {
    output.status = 'completed';

    updateResults(input, output, 'win', 'loss');
    updateResults(input, output, 'loss', 'win');
    updateResults(input, output, 'draw', 'draw');

    updateForfeit(input, output);
}

function updateForfeit(input: Partial<Match>, output: Partial<Match>) {
    if (input.opponent1 && input.opponent1.forfeit === true) {
        if (output.opponent2) output.opponent2.result = 'win';
        else output.opponent2 = ({ result: 'win' } as any);
    }

    if (input.opponent2 && input.opponent2.forfeit === true) {
        if (output.opponent1) output.opponent1.result = 'win';
        else output.opponent1 = ({ result: 'win' } as any);
    }
}

function updateResults(input: Partial<Match>, output: Partial<Match>, check: Result, change: Result) {
    if (input.opponent1 && input.opponent2) {
        if ((input.opponent1.result === 'win' && input.opponent2.result === 'win') ||
            (input.opponent1.result === 'loss' && input.opponent2.result === 'loss')) {
            throw Error('There are two winners.');
        }

        if (input.opponent1.forfeit === true && input.opponent2.forfeit === true) {
            throw Error('There are two forfeits.'); // TODO: handle this scenario.
        }
    }

    if (input.opponent1 && input.opponent1.result === check) {
        if (output.opponent2) output.opponent2.result = change;
        else output.opponent2 = ({ result: change } as any);
    }

    if (input.opponent2 && input.opponent2.result === check) {
        if (output.opponent1) output.opponent1.result = change;
        else output.opponent1 = ({ result: change } as any);
    }
}

function updateNext(match: Match) {
    const next = findNextMatch(match);
    const winner = getWinner(match);
    next[getSide(match)] = ({ id: winner } as any);
    db.update('match', next.id, next);
}

/*
    x     |  y  ||  x / 2
    1, 2  |  1  ||  0.5, 1
    3, 4  |  2  ||  1.5, 2
    5, 6  |  3  ||  2.5, 3
    7, 8  |  4  ||  3.5, 4

    ceil(x / 2)
*/

function findNextMatch(match: Match): Match {
    return findMatch(match.stage_id, match.group_id, getRoundNumber(match.round_id) + 1, Math.ceil(match.number / 2));
}

function getRoundNumber(roundId: number): number {
    return db.select('round', roundId).number;
}

function findMatch(stage: number, group: number, roundNumber: number, matchNumber: number): Match {
    const round = db.select('round', round =>
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
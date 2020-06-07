import { db } from "./database";

type Result = 'win' | 'draw' | 'loss';
type TeamSide = 'team1' | 'team2';

interface Team {
    name: string,
    score: number,
    forfeit: boolean,
    result: Result | null,
}

interface Match {
    id: number,
    number: number,
    stage_id: number,
    group_id: number,
    round_id: number,
    status: 'pending' | 'running' | 'completed',
    team1: Team,
    team2: Team,
}

export function updateMatch(match: Match) {
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

function isMatchCompleted(match: Match): boolean {
    return (match.team1 && (match.team1.result !== undefined || match.team1.forfeit !== undefined))
        || (match.team2 && (match.team2.result !== undefined || match.team2.forfeit !== undefined));
}

function updateCompleted(input: Match, output: Match) {
    output.status = 'completed';

    updateResults(input, output, 'win', 'loss');
    updateResults(input, output, 'loss', 'win');
    updateResults(input, output, 'draw', 'draw');

    updateForfeit(input, output);
}

function updateForfeit(input: Match, output: Match) {
    if (input.team1 && input.team1.forfeit === true) {
        if (output.team2) output.team2.result = 'win';
        else output.team2 = ({ result: 'win' } as any);
    }

    if (input.team2 && input.team2.forfeit === true) {
        if (output.team1) output.team1.result = 'win';
        else output.team1 = ({ result: 'win' } as any);
    }
}

function updateResults(input: Match, output: Match, check: Result, change: Result) {
    if (input.team1 && input.team2) {
        if ((input.team1.result === 'win' && input.team2.result === 'win') ||
            (input.team1.result === 'loss' && input.team2.result === 'loss')) {
            throw Error('There are two winners.');
        }

        if (input.team1.forfeit === true && input.team2.forfeit === true) {
            throw Error('There are two forfeits.'); // TODO: handle this scenario.
        }
    }

    if (input.team1 && input.team1.result === check) {
        if (output.team2) output.team2.result = change;
        else output.team2 = ({ result: change } as any);
    }

    if (input.team2 && input.team2.result === check) {
        if (output.team1) output.team1.result = change;
        else output.team1 = ({ result: change } as any);
    }
}

function updateNext(match: Match) {
    const next = findNextMatch(match);
    const winner = getWinnerName(match);
    next[getSide(match)] = ({ name: winner } as any);
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

function getWinnerName(match: Match): string {
    let winner = null;

    if (match.team1.result === 'win') {
        if (!match.team1.name) throw Error('Team1 has no name.');
        winner = match.team1.name;
    }

    if (match.team2.result === 'win') {
        if (!match.team2.name) throw Error('Team1 has no name.');
        if (winner !== null) throw Error('There are two winners.')
        winner = match.team2.name;
    }

    if (winner === null) throw Error('No winner found.');
    return winner;
}

function getSide(match: Match): TeamSide {
    return match.number % 2 === 1 ? 'team1' : 'team2';
}
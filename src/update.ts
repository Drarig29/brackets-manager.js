import { db } from "./database";

type Result = 'win' | 'draw' | 'loss';
type TeamSide = 'team1' | 'team2';

interface Team {
    name: string,
    score: number,
    forfeit: boolean,
    result: Result,
}

interface Match {
    id: number,
    number: number,
    stage_id: number,
    group_id: number,
    round_id: number,
    status: 'pending' | 'running' | 'completed',
    team1: Partial<Team>,
    team2: Partial<Team>,
}

export function updateMatch(match: Match) {
    if (match.id === undefined) throw Error('No match id given.');

    const completed = (match.team1 && match.team1.result) || (match.team2 && match.team2.result);
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

function updateCompleted(input: Match, output: Match) {
    output.status = 'completed';

    updateResults(input, output, 'win', 'loss');
    updateResults(input, output, 'loss', 'win');
    updateResults(input, output, 'draw', 'draw');
}

function updateResults(input: Match, output: Match, check: Result, change: Result) {
    if (input.team1 && input.team1.result === check) {
        if (output.team2)
            output.team2.result = change;
        else
            output.team2 = { result: change };
    }

    if (input.team2 && input.team2.result === check) {
        if (output.team1)
            output.team1.result = change;
        else
            output.team1 = { result: change };
    }
}

function updateNext(match: Match) {
    const next = findNextMatch(match);
    const winner = getWinnerName(match);
    next[getSide(match)] = { name: winner };
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
    if (match.team1.result === 'win') {
        if (!match.team1.name) throw Error('Team1 has no name.');
        return match.team1.name;
    }

    if (match.team2.result === 'win') {
        if (!match.team2.name) throw Error('Team1 has no name.');
        return match.team2.name;
    }

    throw Error('No winner found.')
}

function getSide(match: Match): TeamSide {
    return match.number % 2 === 1 ? 'team1' : 'team2';
}
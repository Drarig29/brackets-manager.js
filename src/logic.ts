import { makePairs } from 'brackets-model';
import { Tournament, Teams } from 'brackets-model/dist/types'
import { db } from './database';

export function create(tournament: Tournament) {
    if (tournament.type === 'double_elimination') {
        createDoubleElimination(tournament.teams);
    }
}

function createDoubleElimination(teams: Teams) {
    const roundCount = Math.log2(teams.length);

    for (let i = roundCount - 1; i >= 0; i--) {
        const matchCount = Math.pow(2, i);

        if (i === roundCount - 1)
            createRound(matchCount, teams);
        else
            createRound(matchCount, []);
    }
}

function createRound(count: number, teams: Teams) {
    const allOpponents = makePairs(teams);
    const roundId = db.insert('round', { count });

    for (let i = 0; i < count; i++) {
        createMatch(roundId, allOpponents[i]);
    }
}

function createMatch(roundId: number, opponents?: Teams) {
    db.insert('match', {
        round_id: roundId,
        status: 'pending',
        team1: opponents ? opponents[0] : null,
        team2: opponents ? opponents[1] : null,
    });
}
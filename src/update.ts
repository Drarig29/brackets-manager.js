import { db } from "./database";

interface Team {
    name: string,
    score: number,
    forfeit: boolean,
}

interface Match {
    id: number,
    stage_id: number,
    group_id: number,
    round_id: number,
    status: 'pending' | 'running' | 'completed',
    team1: Team,
    team2: Team,
}

export function updateMatch(match: Match) {
    if (match.id === undefined) throw Error('No match id given.');

    if (match.status) db.update('match', match.id, 'status', match.status);
    if (match.team1) db.update('match', match.id, 'team1', match.team1);
}
import { db } from "./database";
import { Match } from "brackets-model";

export function getRanking(groupId: number): string[] {
    const matches = db.select<Match>('match', match => match.group_id === groupId);
    if (!matches) throw Error('No match found.');

    const teams = db.all<any>('team');
    const wins: { [key: number]: number } = Object.fromEntries(teams.map(team => [team.id, 0]));

    for (const match of matches) {
        if (match.opponent1 && match.opponent1.result === 'win') {
            wins[match.opponent1.id]++;
        } else if (match.opponent2 && match.opponent2.result === 'win') {
            wins[match.opponent2.id]++;
        }
    }

    const entries = Object.entries(wins).sort((a, b) => b[1] - a[1]);
    const ranking = entries.map(entry => teams.find(team => team.id === parseInt(entry[0])).name);
    return ranking;
}
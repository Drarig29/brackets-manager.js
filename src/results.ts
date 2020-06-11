import { Match, Participant } from "brackets-model";
import { BracketsManager } from ".";

export async function getRanking(this: BracketsManager, groupId: number): Promise<string[]> {
    const matches = await this.storage.select<Match>('match', match => match.group_id === groupId);
    if (!matches) throw Error('No match found.');

    const teams = await this.storage.select<Participant>('participant');
    if (!teams) throw Error('No teams found.');

    const wins: { [key: number]: number } = Object.fromEntries(teams.map(team => [team.id, 0]));

    for (const match of matches) {
        if (match.opponent1 && match.opponent1.result === 'win' && match.opponent1.id !== null) {
            wins[match.opponent1.id]++;
        } else if (match.opponent2 && match.opponent2.result === 'win' && match.opponent2.id !== null) {
            wins[match.opponent2.id]++;
        }
    }

    const entries = Object.entries(wins).sort((a, b) => b[1] - a[1]);
    const ranking = entries.map(entry => {
        const team = teams.find(team => team.id === parseInt(entry[0]));
        if (!team) throw Error('Team not found.');
        return team.name;
    });

    return ranking;
}
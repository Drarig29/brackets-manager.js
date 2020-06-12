import { Match, Participant } from "brackets-model";
import { BracketsManager } from ".";
import * as helpers from "./helpers";

export async function getRanking(this: BracketsManager, groupId: number): Promise<string[]> {
    const matches = await this.storage.select<Match>('match', match => match.group_id === groupId);
    if (!matches || matches.length === 0) throw Error('No match found.');

    const teams = await this.storage.select<Participant>('participant');
    if (!teams || teams.length === 0) throw Error('No teams found.');

    const wins: { [key: number]: number } = Object.fromEntries(teams.map(team => [team.id, 0]));

    for (const match of matches) {
        const { winner } = helpers.getMatchResults(match);
        if (winner != null) wins[winner]++;
    }

    const entries = Object.entries(wins).sort((a, b) => b[1] - a[1]);
    const ranking = entries.map(entry => {
        const team = teams.find(team => team.id === parseInt(entry[0]));
        if (!team) throw Error('Team not found.');
        return team.name;
    });

    return ranking;
}
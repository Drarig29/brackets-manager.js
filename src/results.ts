import { Match, Participant, Stage } from "brackets-model";
import { BracketsManager } from ".";
import * as helpers from "./helpers";

export async function ranking(this: BracketsManager, groupId: number): Promise<string[]> {
    const matches = await this.storage.select<Match>('match', { group_id: groupId });
    if (!matches || matches.length === 0) throw Error('No match found.');

    // All in the same stage, so get the tournament's id.
    const stage = await this.storage.select<Stage>('stage', matches[0].stage_id);
    if (!stage) throw Error('Stage not found.');

    const teams = await this.storage.select<Participant>('participant', { tournament_id: stage.tournament_id });
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
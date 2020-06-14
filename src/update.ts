import { Match, Result, Round, Group, Stage } from "brackets-model";
import { IStorage } from "./storage";
import { BracketsManager } from ".";
import * as helpers from './helpers';

export async function updateMatch(this: BracketsManager, values: Partial<Match>) {
    const update = new Update(this.storage);
    await update.match(values);
}

class Update {

    private storage: IStorage;

    constructor(storage: IStorage) {
        this.storage = storage;
    }

    public async match(match: Partial<Match>) {
        if (match.id === undefined) throw Error('No match id given.');

        const stored = await this.storage.select<Match>('match', match.id);
        if (!stored) throw Error('Match not found.');

        const inRoundRobin = await this.isInRoundRobin(stored);
        if (!inRoundRobin && await this.isMatchLocked(stored)) throw Error('The match is locked.');

        const completed = helpers.isMatchCompleted(match);
        if (match.status === 'completed' && !completed) throw Error('The match is not really completed.');

        this.setGeneric(stored, match);

        if (completed) {
            this.setCompleted(stored, match);
        } else if (helpers.isMatchCompleted(stored)) {
            this.removeCompleted(stored);
        }

        await this.storage.update('match', match.id, stored);

        if (!inRoundRobin && completed) {
            await this.updateNext(stored);
        }
    }

    private setGeneric(stored: Match, match: Partial<Match>) {
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

    private setCompleted(stored: Match, match: Partial<Match>) {
        stored.status = 'completed';

        this.setResults(stored, match, 'win', 'loss');
        this.setResults(stored, match, 'loss', 'win');
        this.setResults(stored, match, 'draw', 'draw');

        this.setForfeits(stored, match);
    }

    private removeCompleted(stored: Match) {
        stored.status = 'running';

        if (stored.opponent1) stored.opponent1.forfeit = undefined;
        if (stored.opponent1) stored.opponent1.result = undefined;
        if (stored.opponent2) stored.opponent2.forfeit = undefined;
        if (stored.opponent2) stored.opponent2.result = undefined;
    }

    private setResults(stored: Match, match: Partial<Match>, check: Result, change: Result) {
        if (match.opponent1 && match.opponent2) {
            if ((match.opponent1.result === 'win' && match.opponent2.result === 'win') ||
                (match.opponent1.result === 'loss' && match.opponent2.result === 'loss')) {
                throw Error('There are two winners.');
            }

            if (match.opponent1.forfeit === true && match.opponent2.forfeit === true) {
                throw Error('There are two forfeits.');
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

    private setForfeits(stored: Match, match: Partial<Match>) {
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

    private async updateNext(match: Match) {
        const nextMatches = await this.getNextMatches(match);
        if (nextMatches.length === 0) return;

        const { winner, loser } = helpers.getMatchResults(match);
        nextMatches[0][helpers.getSide(match)] = { id: winner };
        this.storage.update('match', nextMatches[0].id, nextMatches[0]);

        if (nextMatches.length === 2) {
            nextMatches[1][helpers.getSide(match)] = { id: loser };
            this.storage.update('match', nextMatches[1].id, nextMatches[1]);
        }
    }

    private async getRoundNumber(roundId: number): Promise<number> {
        const round = await this.storage.select<Round>('round', roundId);
        if (!round) throw Error('Round not found.');
        return round.number;
    }

    /**
     * One of these situations may lock the match:
     * 
     * - The matches leading to the locked match have not been completed yet.
     * - One of the participants from the locked match has already played its following match.
     * @param match The match to check.
     */
    private async isMatchLocked(match: Match): Promise<boolean> {
        const previousMatches = await this.getPreviousMatches(match);

        if (previousMatches.length === 2 &&
            (!helpers.isMatchCompleted(previousMatches[0]) || !helpers.isMatchCompleted(previousMatches[1])))
            return true; // Previous matches not completed yet.

        const nextMatches = await this.getNextMatches(match);

        if (nextMatches.length === 0)
            return false; // No following match.

        if (nextMatches.length === 1 && helpers.isMatchCompleted(nextMatches[0]))
            return true; // Next match already completed.

        if (nextMatches.length === 2 &&
            (helpers.isMatchCompleted(nextMatches[0]) || helpers.isMatchCompleted(nextMatches[1])))
            return true; // Next matches already completed.

        return false;
    }

    private async getPreviousMatches(match: Match): Promise<Match[]> {
        const inLoserBracket = await this.isInLoserBracket(match);
        const roundNumber = await this.getRoundNumber(match.round_id);

        if (inLoserBracket) {
            const winnerBracket = await this.findWinnerBracket();
            const roundNumberWB = Math.ceil((roundNumber + 1) / 2);

            if (roundNumber === 1) { // First major round.
                return [
                    await this.findMatch(winnerBracket.id, roundNumberWB, match.number * 2 - 1),
                    await this.findMatch(winnerBracket.id, roundNumberWB, match.number * 2),
                ];
            } else if (roundNumber % 2 === 1) { // Minor rounds.
                return [
                    await this.findMatch(winnerBracket.id, roundNumberWB, match.number),
                    await this.findMatch(match.group_id, roundNumber - 1, match.number),
                ];
            }
        }

        if (roundNumber === 1) {
            return []; // The match is in the first round of the upper bracket.
        }

        return [
            await this.findMatch(match.group_id, roundNumber - 1, match.number * 2 - 1),
            await this.findMatch(match.group_id, roundNumber - 1, match.number * 2),
        ];
    }

    private async getNextMatches(match: Match): Promise<Match[]> {
        const matches: Match[] = [];

        const roundNumber = await this.getRoundNumber(match.round_id);

        // Not always the opposite of "inLoserBracket". Could be in simple elimination.
        const inWinnerBracket = await this.isInWinnerBracket(match);
        const inLoserBracket = await this.isInLoserBracket(match);

        if (inLoserBracket && roundNumber % 2 === 1) { // Major rounds.
            matches.push(await this.findMatch(match.group_id, roundNumber + 1, match.number));
        } else { // Upper bracket rounds or lower bracket minor rounds.
            matches.push(await this.findMatch(match.group_id, roundNumber + 1, Math.ceil(match.number / 2)));
        }

        if (inWinnerBracket) {
            const loserBracket = await this.findLoserBracket();
            const roundNumberLB = roundNumber > 1 ? (roundNumber - 1) * 2 : 1;
            const matchNumberLB = roundNumber > 1 ? match.number : Math.ceil(match.number / 2);
            matches.push(await this.findMatch(loserBracket.id, roundNumberLB, matchNumberLB));
        }

        return matches;
    }

    private async findWinnerBracket(): Promise<Group> {
        const group = await this.storage.select<Group>('group', { name: 'Winner Bracket' });
        if (!group || group.length === 0) throw Error('Group not found.');
        return group[0];
    }

    private async findLoserBracket(): Promise<Group> {
        const group = await this.storage.select<Group>('group', { name: 'Loser Bracket' });
        if (!group || group.length === 0) throw Error('Group not found.');
        return group[0];
    }

    private isInWinnerBracket(match: Match): Promise<boolean> {
        return this.isInGroupOfName(match, 'Winner Bracket');
    }

    private isInLoserBracket(match: Match): Promise<boolean> {
        return this.isInGroupOfName(match, 'Loser Bracket');
    }

    private async isInRoundRobin(match: Match): Promise<boolean> {
        const stage = await this.storage.select<Stage>('stage', match.stage_id);
        if (!stage) throw Error('Stage not found.');
        return stage.type === 'round_robin';
    }

    private async isInGroupOfName(match: Match, name: string): Promise<boolean> {
        const group = await this.storage.select<Group>('group', match.group_id);
        if (!group) throw Error('Group not found.');
        return group.name === name;
    }

    private async findMatch(group: number, roundNumber: number, matchNumber: number): Promise<Match> {
        const round = await this.storage.select<Round>('round', {
            group_id: group,
            number: roundNumber,
        });

        if (!round || round.length === 0) throw Error('This round does not exist.');

        const match = await this.storage.select<Match>('match', {
            round_id: round[0].id,
            number: matchNumber,
        });

        if (!match || match.length === 0) throw Error('This match does not exist.');
        return match[0];
    }
}
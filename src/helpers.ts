import { ParticipantResult, Match, MatchResults, Result, Seeding, Participant, SeedingIds } from "brackets-model";

/**
 * Distributes participants in rounds for a round-robin group.
 * 
 * Conditions:
 *   - Each participant matches each other only once.
 *   - Each participant plays once in each round.
 */
export function roundRobinMatches<T>(participants: T[]): T[][][] {
    const n = participants.length;
    const n1 = n % 2 === 0 ? n : n + 1;
    const roundCount = n1 - 1;
    const matchPerRound = n1 / 2;

    const rounds: T[][][] = [];

    for (let roundId = 0; roundId < roundCount; roundId++) {
        const matches = [];

        for (let matchId = 0; matchId < matchPerRound; matchId++) {
            if (matchId === 0 && n % 2 === 1) continue;

            const opponentsIds: number[] = [
                (roundId - matchId - 1 + n1) % (n1 - 1),
                matchId === 0 ? n1 - 1 : (roundId + matchId) % (n1 - 1),
            ]

            matches.push([
                participants[opponentsIds[0]],
                participants[opponentsIds[1]],
            ]);
        }

        rounds.push(matches);
    }

    return rounds;
}

/**
 * A helper to assert our generated round-robin is correct.
 */
export function assertRoundRobin<T>(input: T[], output: T[][][]) {
    const n = input.length;
    const matchPerRound = Math.floor(n / 2);
    const roundCount = n % 2 === 0 ? n - 1 : n;

    if (output.length !== roundCount) throw Error('Round count is wrong');
    if (!output.every(round => round.length === matchPerRound)) throw Error('Not every round has the good number of matches');

    const checkAllOpponents = Object.fromEntries(input.map(element => [element, new Set<T>()]));

    for (const round of output) {
        const checkUnique = new Set<T>();

        for (const match of round) {
            if (match.length !== 2) throw Error('One match is not a pair');

            if (checkUnique.has(match[0])) throw Error('This team is already playing');
            checkUnique.add(match[0]);

            if (checkUnique.has(match[1])) throw Error('This team is already playing');
            checkUnique.add(match[1]);

            if (checkAllOpponents[match[0]].has(match[1])) throw Error('The team has already matched this team');
            checkAllOpponents[match[0]].add(match[1]);

            if (checkAllOpponents[match[1]].has(match[0])) throw Error('The team has already matched this team');
            checkAllOpponents[match[1]].add(match[0]);
        }
    }
}

/**
 * Distributes elements in groups of equal size.
 * @param elements A list of elements to distribute in groups.
 * @param groupCount The group count.
 */
export function makeGroups<T>(elements: T[], groupCount: number): T[][] {
    const groupSize = Math.ceil(elements.length / groupCount);
    const result: T[][] = [];

    for (let i = 0; i < elements.length; i++) {
        if (i % groupSize === 0)
            result.push([]);

        result[result.length - 1].push(elements[i]);
    }

    return result;
}

/**
 * Makes pairs with each element and its next one.
 * @example [1, 2, 3, 4] --> [[1, 2], [3, 4]]
 * @param array A list of elements.
 */
export function makePairs<T>(array: T[]): T[][];

/**
 * Makes pairs with one element from `left` and the other from `right`.
 * @example [1, 2] + [3, 4] --> [[1, 3], [2, 4]]
 * @param left The first list of elements.
 * @param right The second list of elements.
 */
export function makePairs<T>(left: T[], right: T[]): T[][];

export function makePairs<T>(left: T[], right?: T[]): T[][] {
    if (!right) {
        ensureEvenSized(left);
        return left.map((current, i) => (i % 2 === 0) ? [current, left[i + 1]] : [])
            .filter(v => v.length > 0);
    }

    ensureEquallySized(left, right);
    return left.map((current, i) => [current, right[i]]);
}

/**
 * Ensures that a list of elements has an even size.
 * @param array A list of elements.
 */
export function ensureEvenSized<T>(array: T[]) {
    if (array.length % 2 === 1) {
        throw Error('Array size must be even.');
    }
}

/**
 * Ensures that two lists of elements have the same size.
 * @param left The first list of elements.
 * @param right The second list of elements.
 */
export function ensureEquallySized<T>(left: T[], right: T[]) {
    if (left.length !== right.length) {
        throw Error('Arrays size must be equal.');
    }
}

/**
 * Ensures that a list of elements has a size which is a power of two.
 * @param array A list of elements.
 */
export function ensurePowerOfTwoSized<T>(array: T[]) {
    if (!Number.isInteger(Math.log2(array.length))) {
        throw Error('Array size must be a power of 2.');
    }
}

/**
 * Ensures that a match scores aren't tied.
 * @param scores Two numbers which are scores.
 */
export function ensureNotTied(scores: number[]) {
    if (scores[0] === scores[1]) {
        throw Error(`${scores[0]} and ${scores[1]} are tied. It cannot be.`);
    }
}

/**
 * Converts a participant slot to a result stored in storage.
 * @param slot A participant slot.
 */
export function toResult(slot: ParticipantSlot): ParticipantResult | null {
    return slot ? {
        id: slot.id,
        position: slot.position,
    } : null;
}

/**
 * Returns the pre-computed winner for a match because of BYEs.
 * @param opponents Two opponents.
 */
export function byeWinner(opponents: Duel): ParticipantSlot {
    if (opponents[0] === null && opponents[1] === null) // Double BYE.
        return null; // BYE.

    if (opponents[0] === null && opponents[1] !== null) // opponent1 BYE.
        return { id: opponents[1]!.id }; // opponent2.

    if (opponents[0] !== null && opponents[1] === null) // opponent2 BYE.
        return { id: opponents[0]!.id }; // opponent1.

    return { id: null }; // Normal.
}

/**
 * Returns the pre-computed winner for a match because of BYEs in a lower bracket.
 * @param opponents Two opponents.
 */
export function byeWinnerToGrandFinal(opponents: Duel): ParticipantSlot {
    const winner = byeWinner(opponents);
    if (winner) winner.position = 1;
    return winner;
}

/**
 * Returns the pre-computed loser for a match because of BYEs.
 * 
 * Only used for loser bracket.
 * @param opponents Two opponents.
 * @param index The index of the duel in the round.
 */
export function byeLoser(opponents: Duel, index: number): ParticipantSlot {
    if (opponents[0] === null || opponents[1] === null) // At least one BYE.
        return null; // BYE.

    return { id: null, position: index + 1 }; // Normal.
}

/**
 * Adds positions in each opponent if not present.
 * @param duels A list of duels.
 */
export function populatePosition(duels: Duels): void {
    let i = 1;

    for (const duel of duels) {
        if (duel[0] && duel[0].position) return; // Shortcut because if one position is present, then all will.
        duel![0]!.position = i++;
        duel![1]!.position = i++;
    }
}

/**
 * Returns the winner side or `null` if no winner.
 * @param match A match's results.
 */
export function getMatchResult(match: MatchResults): Side | null {
    let winner: Side | null = null;

    if (match.opponent1 && match.opponent1.result === 'win') {
        winner = 'opponent1';
    }

    if (match.opponent2 && match.opponent2.result === 'win') {
        if (winner !== null) throw Error('There are two winners.')
        winner = 'opponent2';
    }

    return winner;
}

/**
 * Finds a position in a list of matches.
 * @param matches A list of matches to search into.
 * @param position The position to find.
 */
export function findPosition(matches: Match[], position: number): ParticipantResult | null {
    for (const match of matches) {
        if (match.opponent1 && match.opponent1.position === position)
            return match.opponent1;

        if (match.opponent2 && match.opponent2.position === position)
            return match.opponent2;
    }

    return null;
}

/**
 * Gets the side where the winner of the given match will go in the next match.
 * @param match The current match.
 */
export function getSide(match: Match): Side {
    return match.number % 2 === 1 ? 'opponent1' : 'opponent2';
}

/**
 * Gets the opponent at the given side of the given match.
 * @param match The match to get the opponent from.
 * @param side The side where to get the opponent from.
 */
export function getOpponent(match: Match, side: Side): ParticipantResult {
    const opponent = match[side];
    return { id: opponent && opponent.id };
}

/**
 * Gets the other side of a match.
 * @param side The side that we don't want.
 */
export function getOtherSide(side: Side): Side {
    return side === 'opponent1' ? 'opponent2' : 'opponent1';
}

/**
 * Checks if a match is started.
 * @param match Partial match results.
 */
export function isMatchStarted(match: Partial<MatchResults>): boolean {
    return (!!match.opponent1 && match.opponent1.score !== undefined)
        || (!!match.opponent2 && match.opponent2.score !== undefined);
}

/**
 * Checks if a match is completed.
 * @param match Partial match results.
 */
export function isMatchCompleted(match: Partial<MatchResults>): boolean {
    return (!!match.opponent1 && (match.opponent1.result !== undefined || match.opponent1.forfeit !== undefined))
        || (!!match.opponent2 && (match.opponent2.result !== undefined || match.opponent2.forfeit !== undefined));
}

/**
 * Updates the scores of a match.
 * @param stored A reference to what will be updated in the storage.
 * @param match Input of the update.
 */
export function setScores(stored: MatchResults, match: Partial<MatchResults>) {
    if ((!match.opponent1 || match.opponent1.score === undefined) &&
        (!match.opponent2 || match.opponent2.score === undefined)) {
        // No score update.
        if (match.status) stored.status = match.status;
        return;
    }

    if (!stored.opponent1 || !stored.opponent2) throw Error('No team is defined yet. Can\'t set the score.');

    // Default when scores are updated.
    stored.status = 'running';
    stored.opponent1.score = 0;
    stored.opponent2.score = 0;

    if (match.opponent1 && match.opponent1.score !== undefined)
        stored.opponent1.score = match.opponent1.score;

    if (match.opponent2 && match.opponent2.score !== undefined)
        stored.opponent2.score = match.opponent2.score;
}

/**
 * Completes a match and handles results and forfeits.
 * @param stored A reference to what will be updated in the storage.
 * @param match Input of the update.
 */
export function setCompleted(stored: MatchResults, match: Partial<MatchResults>) {
    stored.status = 'completed';

    setResults(stored, match, 'win', 'loss');
    setResults(stored, match, 'loss', 'win');
    setResults(stored, match, 'draw', 'draw');

    setForfeits(stored, match);
}

/**
 * Removes the 'completed' status of a match, set it back to running and removes results.
 * @param stored A reference to what will be updated in the storage.
 */
export function removeCompleted(stored: MatchResults) {
    stored.status = 'running';

    if (stored.opponent1) {
        stored.opponent1.forfeit = undefined;
        stored.opponent1.result = undefined;
    }

    if (stored.opponent2) {
        stored.opponent2.forfeit = undefined;
        stored.opponent2.result = undefined;
    }
}

/**
 * Ensures the symmetry between opponents.
 * 
 * Sets an opponent's result to something, based on the result on the other opponent.
 * @param stored A reference to what will be updated in the storage.
 * @param match Input of the update.
 * @param check A result to check in each opponent.
 * @param change A result to set in each other opponent if `check` is correct.
 */
export function setResults(stored: MatchResults, match: Partial<MatchResults>, check: Result, change: Result) {
    if (match.opponent1 && match.opponent2) {
        if ((match.opponent1.result === 'win' && match.opponent2.result === 'win') ||
            (match.opponent1.result === 'loss' && match.opponent2.result === 'loss')) {
            throw Error('There are two winners.');
        }

        if (match.opponent1.forfeit === true && match.opponent2.forfeit === true) {
            throw Error('There are two forfeits.');
        }
    }

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

/**
 * Sets forfeits for each opponent (if needed).
 * @param stored A reference to what will be updated in the storage.
 * @param match Input of the update.
 */
export function setForfeits(stored: MatchResults, match: Partial<MatchResults>) {
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

export function isSeedingWithIds(seeding: Seeding | SeedingIds) {
    return seeding.some((value: any) => typeof value === 'number');
}

export function extractParticipantsFromSeeding(tournamentId: number, seeding: Seeding) {
    const withoutByes: string[] = seeding.filter(name => name !== null) as any;

    const participants = withoutByes.map<OmitId<Participant>>(name => ({
        tournament_id: tournamentId,
        name,
    }));

    return participants;
}

export function mapParticipantsNamesToDatabase(seeding: Seeding, database: Participant[]) {
    const slots = seeding.map<ParticipantSlot>((name, i) => {
        if (name === null) return null; // BYE.

        const found = database.find(participant => participant.name === name);
        if (!found) throw Error('Participant name not found in database.');

        return { id: found.id, position: i + 1 };
    });

    return slots;
}

export function mapParticipantsIdsToDatabase(seeding: SeedingIds, database: Participant[]) {
    const slots = seeding.map<ParticipantSlot>((id, i) => {
        if (id === null) return null; // BYE.

        const found = database.find(participant => participant.id === id);
        if (!found) throw Error('Participant not found in database.');

        return { id: found.id, position: i + 1 };
    });

    return slots;
}

export function matchesToSeeding(matches: Match[]) {
    const flattened = ([] as ParticipantSlot[]).concat(...matches.map(match => [match.opponent1, match.opponent2]));
    return flattened.sort((slotA, slotB) => (slotA && slotA.position || 0) - (slotB && slotB.position || 0));
}

export function uniqueBy<T>(array: T[], key: (obj: T) => any) {
    const seen = new Set();
    return array.filter(item => {
        const value = key(item);
        return seen.has(value) ? false : seen.add(value);
    });
}
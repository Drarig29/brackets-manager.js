import {
    Match,
    MatchGame,
    MatchResults,
    Participant,
    ParticipantResult,
    Result,
    RoundRobinMode,
    Seeding,
    SeedOrdering,
    Stage,
    StageType,
    Status,
} from 'brackets-model';

import { Duel, OmitId, ParticipantSlot, Scores, Side } from './types';
import { ordering } from './ordering';
import { BracketType } from './update';

/**
 * The result of an array split by parity.
 */
interface ParitySplit<T> {
    even: T[],
    odd: T[],
}

/**
 * Splits an array in two parts: one with even indices and the other with odd indices.
 *
 * @param array The array to split.
 */
export function splitByParity<T>(array: T[]): ParitySplit<T> {
    return {
        even: array.filter((_, i) => i % 2 === 0),
        odd: array.filter((_, i) => i % 2 === 1),
    };
}

/**
 * Makes a list of rounds containing the matches of a round-robin group.
 *
 * @param participants The participants to distribute.
 * @param mode The round-robin mode.
 */
export function makeRoundRobinMatches<T>(participants: T[], mode: RoundRobinMode = 'simple'): [T, T][][] {
    const distribution = makeRoundRobinDistribution(participants);

    if (mode === 'simple')
        return distribution;

    // Reverse rounds and their content.
    const symmetry = distribution.map(round => [...round].reverse()).reverse();

    return [...distribution, ...symmetry];
}

/**
 * Distributes participants in rounds for a round-robin group.
 *
 * Conditions:
 * - Each participant plays each other once.
 * - Each participant plays once in each round.
 *
 * @param participants The participants to distribute.
 */
export function makeRoundRobinDistribution<T>(participants: T[]): [T, T][][] {
    const n = participants.length;
    const n1 = n % 2 === 0 ? n : n + 1;
    const roundCount = n1 - 1;
    const matchPerRound = n1 / 2;

    const rounds: [T, T][][] = [];

    for (let roundId = 0; roundId < roundCount; roundId++) {
        const matches: [T, T][] = [];

        for (let matchId = 0; matchId < matchPerRound; matchId++) {
            if (matchId === 0 && n % 2 === 1) continue;

            const opponentsIds = [
                (roundId - matchId - 1 + n1) % (n1 - 1),
                matchId === 0 ? n1 - 1 : (roundId + matchId) % (n1 - 1),
            ];

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
 *
 * @param input The input seeding.
 * @param output The resulting distribution of seeds in groups.
 */
export function assertRoundRobin<T>(input: T[], output: [T, T][][]): void {
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
 *
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
 * Balances BYEs to prevents having BYE against BYE in matches.
 *
 * @param seeding The seeding of the stage.
 * @param participantCount The number of participants in the stage.
 */
export function balanceByes(seeding: Seeding, participantCount?: number): Seeding {
    seeding = seeding.filter(v => v !== null);

    participantCount = participantCount || getNearestPowerOfTwo(seeding.length);

    if (seeding.length < participantCount / 2) {
        const flat = seeding.map(v => [v, null]).flat();
        return setArraySize(flat, participantCount, null);
    }

    const nonNullCount = seeding.length;
    const nullCount = participantCount - nonNullCount;
    const againstEachOther = seeding.slice(0, nonNullCount - nullCount).filter((_, i) => i % 2 === 0).map((_, i) => [seeding[2 * i], seeding[2 * i + 1]]);
    const againstNull = seeding.slice(nonNullCount - nullCount, nonNullCount).map(v => [v, null]);
    const flat = [...againstEachOther.flat(), ...againstNull.flat()];

    return setArraySize(flat, participantCount, null);
}

/**
 * Sets the size of an array with a placeholder if the size is bigger.
 *
 * @param array The original array.
 * @param length The new length.
 * @param placeholder A placeholder to use to fill the empty space.
 */
export function setArraySize<T>(array: T[], length: number, placeholder: T): T[] {
    return Array.from(Array(length), (_, i) => array[i] || placeholder);
}

/**
 * Makes pairs with each element and its next one.
 *
 * @example [1, 2, 3, 4] --> [[1, 2], [3, 4]]
 * @param array A list of elements.
 */
export function makePairs<T>(array: T[]): [T, T][] {
    return array.map((_, i) => (i % 2 === 0) ? [array[i], array[i + 1]] : []).filter((v): v is [T, T] => v.length === 2);
}

/**
 * Ensures that a list of elements has an even size.
 *
 * @param array A list of elements.
 */
export function ensureEvenSized<T>(array: T[]): void {
    if (array.length % 2 === 1)
        throw Error('Array size must be even.');
}

/**
 * Ensures that two lists of elements have the same size.
 *
 * @param left The first list of elements.
 * @param right The second list of elements.
 */
export function ensureEquallySized<T>(left: T[], right: T[]): void {
    if (left.length !== right.length)
        throw Error('Arrays\' size must be equal.');
}

/**
 * Fixes the seeding by enlarging it if it's not complete.
 *
 * @param seeding The seeding of the stage.
 * @param participantCount The number of participants in the stage.
 */
export function fixSeeding(seeding: Seeding, participantCount: number): Seeding {
    if (seeding.length > participantCount)
        throw Error('The seeding has more participants than the size of the stage.');

    if (seeding.length < participantCount)
        return setArraySize(seeding, participantCount, null);

    return seeding;
}

/**
 * Ensures that the participant count is valid.
 *
 * @param participantCount The number to test.
 */
export function ensureValidSize(participantCount: number): void {
    if (participantCount === 0)
        throw Error('Impossible to create an empty stage. If you want an empty seeding, just set the size of the stage.');

    if (participantCount < 2)
        throw Error('Impossible to create a stage with less than 2 participants.');

    if (!Number.isInteger(Math.log2(participantCount)))
        throw Error('The library only supports a participant count which is a power of two.');
}

/**
 * Ensures that a match scores aren't tied.
 *
 * @param scores Two numbers which are scores.
 */
export function ensureNotTied(scores: [number, number]): void {
    if (scores[0] === scores[1])
        throw Error(`${scores[0]} and ${scores[1]} are tied. It cannot be.`);
}

/**
 * Converts a participant slot to a result stored in storage.
 *
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
 *
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
 *
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
 *
 * @param opponents Two opponents.
 * @param index The index of the duel in the round.
 */
export function byeLoser(opponents: Duel, index: number): ParticipantSlot {
    if (opponents[0] === null || opponents[1] === null) // At least one BYE.
        return null; // BYE.

    return { id: null, position: index + 1 }; // Normal.
}

/**
 * Returns the winner side or `null` if no winner.
 *
 * @param match A match's results.
 */
export function getMatchResult(match: MatchResults): Side | null {
    let winner: Side | null = null;

    if (match.opponent1?.result === 'win')
        winner = 'opponent1';

    if (match.opponent2?.result === 'win') {
        if (winner !== null) throw Error('There are two winners.');
        winner = 'opponent2';
    }

    return winner;
}

/**
 * Finds a position in a list of matches.
 *
 * @param matches A list of matches to search into.
 * @param position The position to find.
 */
export function findPosition(matches: Match[], position: number): ParticipantResult | null {
    for (const match of matches) {
        if (match.opponent1?.position === position)
            return match.opponent1;

        if (match.opponent2?.position === position)
            return match.opponent2;
    }

    return null;
}

/**
 * Gets the side where the winner of the given match will go in the next match.
 *
 * @param matchNumber Number of the match.
 */
export function getSide(matchNumber: number): Side {
    return matchNumber % 2 === 1 ? 'opponent1' : 'opponent2';
}

/**
 * Gets the other side of a match.
 *
 * @param side The side that we don't want.
 */
export function getOtherSide(side: Side): Side {
    return side === 'opponent1' ? 'opponent2' : 'opponent1';
}

/**
 * Checks if a match is started.
 *
 * @param match Partial match results.
 */
export function isMatchStarted(match: Partial<MatchResults>): boolean {
    return match.opponent1?.score !== undefined || match.opponent2?.score !== undefined;
}

/**
 * Checks if a match is completed.
 *
 * @param match Partial match results.
 */
export function isMatchCompleted(match: Partial<MatchResults>): boolean {
    return isMatchByeCompleted(match)
        || match.opponent1?.result !== undefined || match.opponent1?.forfeit !== undefined
        || match.opponent2?.result !== undefined || match.opponent2?.forfeit !== undefined;
}

/**
 * Checks if a match is completed because of at least one BYE.
 * 
 * A match "BYE vs. TBD" isn't considered completed yet.
 * 
 * @param match Partial match results.
 */
export function isMatchByeCompleted(match: Partial<MatchResults>): boolean {
    return (match.opponent1 === null && match.opponent2?.id !== null) // BYE vs. someone
        || (match.opponent2 === null && match.opponent1?.id !== null) // someone vs. BYE
        || (match.opponent1 === null && match.opponent2 === null); // BYE vs. BYE
}

/**
 * Checks if a match's results can't be updated.
 *
 * @param match The match to check.
 */
export function isMatchUpdateLocked(match: MatchResults): boolean {
    return match.status === Status.Locked || match.status === Status.Waiting || match.status === Status.Archived;
}

/**
 * Checks if a match's participants can't be updated.
 *
 * @param match The match to check.
 */
export function isMatchParticipantLocked(match: MatchResults): boolean {
    return match.status >= Status.Running;
}

/**
 * Returns the status of a match based on the presence of the opponents.
 *
 * @param opponents The opponents of a match.
 */
export function getMatchByeStatus(opponents: Duel): Status {
    return getMatchStatus({
        opponent1: opponents[0],
        opponent2: opponents[1],
    });
}

/**
 * Indicates whether a match has at least one BYE or not.
 * 
 * @param match Partial match results.
 */
export function hasBye(match: Partial<MatchResults>): boolean {
    return match.opponent1 === null || match.opponent2 === null;
}

/**
 * Returns the status of a match based on the results of a match.
 *
 * @param match Partial match results.
 */
export function getMatchStatus(match: Partial<MatchResults>): Status {
    if (hasBye(match)) // At least one BYE.
        return Status.Locked;

    if (match.opponent1?.id === null && match.opponent2?.id === null) // Two TBD opponents.
        return Status.Locked;

    if (match.opponent1?.id === null || match.opponent2?.id === null) // One TBD opponent.
        return Status.Waiting;

    if (isMatchCompleted(match))
        return Status.Completed;

    if (isMatchStarted(match))
        return Status.Running;

    return Status.Ready;
}

/**
 * Updates a match results based on an input.
 *
 * @param stored A reference to what will be updated in the storage.
 * @param match Input of the update.
 * @returns `true` if the result of the match changed, `false` otherwise.
 */
export function setMatchResults(stored: MatchResults, match: Partial<MatchResults>): boolean {
    const completed = isMatchCompleted(match);

    if (match.status === Status.Completed && !completed) throw Error('The match is not really completed.');

    setScores(stored, match);

    if (completed) {
        setCompleted(stored, match);
        return true;
    } else if (isMatchCompleted(stored)) {
        removeCompleted(stored);
        return true;
    }

    return false;
}

/**
 * Resets the results of a match. (status, score, forfeit, result)
 *
 * @param stored A reference to what will be updated in the storage.
 */
export function resetMatchResults(stored: MatchResults): void {
    if (stored.opponent1) {
        stored.opponent1.score = undefined;
        stored.opponent1.forfeit = undefined;
        stored.opponent1.result = undefined;
    }

    if (stored.opponent2) {
        stored.opponent2.score = undefined;
        stored.opponent2.forfeit = undefined;
        stored.opponent2.result = undefined;
    }

    stored.status = getMatchStatus(stored);
}

/**
 * Gets the id of the opponent at the given side of the given match.
 *
 * @param match The match to get the opponent from.
 * @param side The side where to get the opponent from.
 */
export function getOpponentId(match: Match, side: Side): number | null {
    const opponent = match[side];
    return opponent && opponent.id;
}

/**
 * Gets the origin position of a side of a match.
 *
 * @param match The match.
 * @param side The side.
 */
export function getOriginPosition(match: Match, side: Side): number {
    const matchNumber = match[side]?.position;
    if (matchNumber === undefined)
        throw Error('Position is undefined.');

    return matchNumber;
}

/**
 * Gets the side the winner of the current match will go to in the next match.
 *
 * @param matchNumber Number of the current match.
 * @param roundNumber Number of the current round.
 * @param roundCount Count of rounds.
 * @param matchLocation Location of the current match.
 */
export function getNextSide(matchNumber: number, roundNumber: number, roundCount: number, matchLocation: BracketType): Side {
    // The nextSide comes from the same bracket.
    if (matchLocation === 'loser_bracket' && roundNumber % 2 === 1)
        return 'opponent2';

    // The nextSide comes from the loser bracket to the final group.
    if (matchLocation === 'loser_bracket' && roundNumber === roundCount)
        return 'opponent2';

    return getSide(matchNumber);
}

/**
 * Gets the side the winner of the current match in loser bracket will go in the next match.
 *
 * @param matchNumber Number of the match.
 * @param nextMatch The next match.
 * @param roundNumber Number of the current round.
 */
export function getNextSideLoserBracket(matchNumber: number, nextMatch: Match, roundNumber: number): Side {
    // The nextSide comes from the WB.
    if (roundNumber > 1)
        return 'opponent1';

    // The nextSide comes from the WB round 1. 
    if (nextMatch.opponent1?.position === matchNumber)
        return 'opponent1';

    return 'opponent2';
}

export type SetNextOpponent = (nextMatches: Match[], index: number, nextSide: Side, match?: Match, currentSide?: Side) => void;

/**
 * Sets an opponent in the next match he has to go.
 *
 * @param nextMatches The matches which follow the current one.
 * @param index Index of the match to set in the next matches.
 * @param nextSide The side the opponent will be on in the next match.
 * @param match The current match.
 * @param currentSide The side the opponent is currently on.
 */
export function setNextOpponent(nextMatches: Match[], index: number, nextSide: Side, match?: Match, currentSide?: Side): void {
    const nextMatch = nextMatches[index];
    nextMatch[nextSide] = {
        id: getOpponentId(match!, currentSide!), // This implementation of SetNextOpponent always has those arguments.
        position: nextMatch[nextSide]?.position,
    };

    if (nextMatch.status < Status.Ready)
        nextMatch.status++;
}

/**
 * Resets an opponent in the match following the current one.
 *
 * @param nextMatches The matches which follow the current one.
 * @param index Index of the match to set in the next matches.
 * @param nextSide The side the opponent will be on in the next match.
 */
export function resetNextOpponent(nextMatches: Match[], index: number, nextSide: Side): void {
    const nextMatch = nextMatches[index];
    nextMatch.status = Status.Locked;
    nextMatch[nextSide] = {
        id: null,
        position: nextMatch[nextSide]?.position,
    };
}

/**
 * Updates the scores of a match.
 *
 * @param stored A reference to what will be updated in the storage.
 * @param match Input of the update.
 */
export function setScores(stored: MatchResults, match: Partial<MatchResults>): void {
    if (match.opponent1?.score === undefined && match.opponent2?.score === undefined) {
        // No score update.
        if (match.status) stored.status = match.status;
        return;
    }

    if (!stored.opponent1 || !stored.opponent2) throw Error('No team is defined yet. Cannot set the score.');

    // Default when scores are updated.
    stored.status = Status.Running;
    stored.opponent1.score = 0;
    stored.opponent2.score = 0;

    if (match.opponent1?.score !== undefined)
        stored.opponent1.score = match.opponent1.score;

    if (match.opponent2?.score !== undefined)
        stored.opponent2.score = match.opponent2.score;
}

/**
 * Completes a match and handles results and forfeits.
 *
 * @param stored A reference to what will be updated in the storage.
 * @param match Input of the update.
 */
export function setCompleted(stored: MatchResults, match: Partial<MatchResults>): void {
    stored.status = Status.Completed;

    setResults(stored, match, 'win', 'loss');
    setResults(stored, match, 'loss', 'win');
    setResults(stored, match, 'draw', 'draw');

    if (stored.opponent1 && !stored.opponent2)
        stored.opponent1.result = 'win'; // Win against opponent 2 BYE.

    if (!stored.opponent1 && stored.opponent2)
        stored.opponent2.result = 'win'; // Win against opponent 1 BYE.

    setForfeits(stored, match);
}

/**
 * Removes the completed status of a match, set it back to running and removes results.
 *
 * @param stored A reference to what will be updated in the storage.
 */
export function removeCompleted(stored: MatchResults): void {
    stored.status = Status.Running;

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
 *
 * @param stored A reference to what will be updated in the storage.
 * @param match Input of the update.
 * @param check A result to check in each opponent.
 * @param change A result to set in each other opponent if `check` is correct.
 */
export function setResults(stored: MatchResults, match: Partial<MatchResults>, check: Result, change: Result): void {
    if (match.opponent1 && match.opponent2) {
        if (match.opponent1.result === 'win' && match.opponent2.result === 'win')
            throw Error('There are two winners.');

        if (match.opponent1.result === 'loss' && match.opponent2.result === 'loss')
            throw Error('There are two losers.');

        if (match.opponent1.forfeit === true && match.opponent2.forfeit === true)
            throw Error('There are two forfeits.');
    }

    if (match.opponent1?.result === check) {
        if (stored.opponent1) stored.opponent1.result = check;
        else stored.opponent1 = { id: null, result: check };

        if (stored.opponent2) stored.opponent2.result = change;
        else stored.opponent2 = { id: null, result: change };
    }

    if (match.opponent2?.result === check) {
        if (stored.opponent2) stored.opponent2.result = check;
        else stored.opponent2 = { id: null, result: check };

        if (stored.opponent1) stored.opponent1.result = change;
        else stored.opponent1 = { id: null, result: change };
    }
}

/**
 * Sets forfeits for each opponent (if needed).
 *
 * @param stored A reference to what will be updated in the storage.
 * @param match Input of the update.
 */
export function setForfeits(stored: MatchResults, match: Partial<MatchResults>): void {
    if (match.opponent1?.forfeit === true) {
        if (stored.opponent1) stored.opponent1.forfeit = true;

        if (stored.opponent2) stored.opponent2.result = 'win';
        else stored.opponent2 = { id: null, result: 'win' };
    }

    if (match.opponent2?.forfeit === true) {
        if (stored.opponent2) stored.opponent2.forfeit = true;

        if (stored.opponent1) stored.opponent1.result = 'win';
        else stored.opponent1 = { id: null, result: 'win' };
    }
}

/**
 * Indicates if a seeding is filled with participants' names or ids.
 *
 * @param seeding The seeding.
 */
export function isSeedingWithIds(seeding: Seeding): boolean {
    return seeding.some((value: string | number | null) => typeof value === 'number');
}

/**
 * Extracts participants from a seeding, without the byes.
 *
 * @param tournamentId ID of the tournament.
 * @param seeding The seeding.
 */
export function extractParticipantsFromSeeding(tournamentId: number, seeding: Seeding): OmitId<Participant>[] {
    const withoutByes = seeding.filter(name => name !== null) as string[];

    const participants = withoutByes.map<OmitId<Participant>>(name => ({
        tournament_id: tournamentId,
        name,
    }));

    return participants;
}

/**
 * Returns participant slots mapped to the instances stored in the database thanks to their name.
 *
 * @param seeding The seeding.
 * @param database The participants stored in the database.
 * @param positions An optional list of positions (seeds) for a manual ordering.
 */
export function mapParticipantsNamesToDatabase(seeding: Seeding, database: Participant[], positions?: number[]): ParticipantSlot[] {
    return mapParticipantsToDatabase('name', seeding, database, positions);
}

/**
 * Returns participant slots mapped to the instances stored in the database thanks to their id.
 *
 * @param seeding The seeding.
 * @param database The participants stored in the database.
 * @param positions An optional list of positions (seeds) for a manual ordering.
 */
export function mapParticipantsIdsToDatabase(seeding: Seeding, database: Participant[], positions?: number[]): ParticipantSlot[] {
    return mapParticipantsToDatabase('id', seeding, database, positions);
}

/**
 * Returns participant slots mapped to the instances stored in the database thanks to a property of theirs.
 *
 * @param prop The property to search participants with.
 * @param seeding The seeding.
 * @param database The participants stored in the database.
 * @param positions An optional list of positions (seeds) for a manual ordering.
 */
export function mapParticipantsToDatabase(prop: keyof Participant, seeding: Seeding, database: Participant[], positions?: number[]): ParticipantSlot[] {
    const slots = seeding.map((slot, i) => {
        if (slot === null) return null; // BYE.

        const found = database.find(participant => participant[prop] === slot);
        if (!found) throw Error(`Participant ${prop} not found in database.`);

        return { id: found.id, position: i + 1 };
    });

    if (!positions)
        return slots;

    if (positions.length !== slots.length)
        throw Error('Not enough seeds in at least one group of the manual ordering.');

    return positions.map(position => slots[position - 1]); // position = i + 1
}

/**
 * Converts a list of matches to a seeding.
 *
 * @param matches The input matches.
 */
export function matchesToSeeding(matches: Match[]): ParticipantSlot[] {
    const flattened = ([] as ParticipantSlot[]).concat(...matches.map(match => [match.opponent1, match.opponent2]));
    return sortSeeding(flattened);
}

/**
 * Sorts the seeding with the BYEs in the correct position.
 *
 * @param slots A list of slots to sort.
 */
export function sortSeeding(slots: ParticipantSlot[]): ParticipantSlot[] {
    const withoutByes = slots.filter(v => v !== null);

    // a and b are not null because of the filter.
    // The slots are from seeding slots, thus they have a position.
    withoutByes.sort((a, b) => a!.position! - b!.position!);

    if (withoutByes.length === slots.length)
        return withoutByes;

    // Same for v and position.
    const placed = Object.fromEntries(withoutByes.map(v => [v!.position! - 1, v]));
    const sortedWithByes = Array.from({ length: slots.length }, (_, i) => placed[i] || null);

    return sortedWithByes;
}

/**
 * Returns a list of objects which have unique values of a specific key.
 *
 * @param array The array to process.
 * @param key The key to filter by.
 */
export function uniqueBy<T>(array: T[], key: (obj: T) => unknown): T[] {
    const seen = new Set();
    return array.filter(item => {
        const value = key(item);
        return seen.has(value) ? false : seen.add(value);
    });
}

/**
 * Makes the transition to a major round for duels of the previous round. The duel count is divided by 2.
 *
 * @param previousDuels The previous duels to transition from.
 */
export function transitionToMajor(previousDuels: Duel[]): Duel[] {
    const currentDuelCount = previousDuels.length / 2;
    const currentDuels: Duel[] = [];

    for (let duelIndex = 0; duelIndex < currentDuelCount; duelIndex++) {
        const prevDuelId = duelIndex * 2;
        currentDuels.push([
            byeWinner(previousDuels[prevDuelId]),
            byeWinner(previousDuels[prevDuelId + 1]),
        ]);
    }

    return currentDuels;
}

/**
 * Makes the transition to a minor round for duels of the previous round. The duel count stays the same.
 *
 * @param previousDuels The previous duels to transition from.
 * @param losers Losers from the previous major round.
 * @param method The ordering method for the losers.
 */
export function transitionToMinor(previousDuels: Duel[], losers: ParticipantSlot[], method?: SeedOrdering): Duel[] {
    const orderedLosers = method ? ordering[method](losers) : losers;
    const currentDuelCount = previousDuels.length;
    const currentDuels: Duel[] = [];

    for (let duelIndex = 0; duelIndex < currentDuelCount; duelIndex++) {
        const prevDuelId = duelIndex;
        currentDuels.push([
            orderedLosers[prevDuelId],
            byeWinner(previousDuels[prevDuelId]),
        ]);
    }

    return currentDuels;
}

/**
 * Sets the parent match to a completed status if all its child games are completed.
 *
 * @param storedParent The parent match stored in the database.
 * @param parent The partial parent match to update.
 * @param scores The scores of the match child games.
 * @param inRoundRobin Indicates whether the parent match is in a round-robin stage.
 */
export function setParentMatchCompleted(storedParent: Match, parent: Partial<MatchResults>, scores: Scores, inRoundRobin: boolean): void {
    const parentCompleted = scores.opponent1 + scores.opponent2 === storedParent.child_count;
    if (!parentCompleted) return;

    if (!parent.opponent1 || !parent.opponent2)
        throw Error('Either opponent1 or opponent2 is falsy.');

    if (scores.opponent1 > scores.opponent2)
        parent.opponent1.result = 'win';
    else if (scores.opponent2 > scores.opponent1)
        parent.opponent2.result = 'win';
    else if (inRoundRobin) {
        parent.opponent1.result = 'draw';
        parent.opponent2.result = 'draw';
    } else
        throw Error('Match games result in a tie for the parent match.');
}

/**
 * Returns a parent match results based on its child games scores.
 *
 * @param storedParent The parent match stored in the database.
 * @param scores The scores of the match child games.
 */
export function getParentMatchResults(storedParent: Match, scores: Scores): Partial<MatchResults> {
    return {
        opponent1: {
            id: storedParent.opponent1 && storedParent.opponent1.id,
            score: scores.opponent1,
        },
        opponent2: {
            id: storedParent.opponent2 && storedParent.opponent2.id,
            score: scores.opponent2,
        },
    };
}

/**
 * Gets the values which need to be updated in a match when it's updated on insertion.
 *
 * @param match The up to date match.
 */
export function getUpdatedMatchResults(match: OmitId<MatchResults>): OmitId<MatchResults> {
    return {
        status: match.status,
        opponent1: match.opponent1,
        opponent2: match.opponent2,
    };
}

/**
 * Calculates the score of a parent match based on its child games.
 *
 * @param games The child games to process.
 */
export function getChildGamesResults(games: MatchGame[]): Scores {
    const scores = {
        opponent1: 0,
        opponent2: 0,
    };

    for (const game of games) {
        const result = getMatchResult(game);
        if (result === 'opponent1') scores.opponent1++;
        else if (result === 'opponent2') scores.opponent2++;
    }

    return scores;
}

/**
 * Gets the default list of seeds for a round's matches.
 *
 * @param inLoserBracket Whether the match is in the loser bracket.
 * @param roundNumber The number of the current round.
 * @param roundCountLB The count of rounds in loser bracket.
 * @param matchCount The count of matches in the round.
 */
export function getSeeds(inLoserBracket: boolean, roundNumber: number, roundCountLB: number, matchCount: number): number[] {
    const seedCount = getSeedCount(inLoserBracket, roundNumber, roundCountLB, matchCount);
    return Array.from(Array(seedCount), (_, i) => i + 1);
}

/**
 * Gets the number of seeds for a round's matches.
 *
 * @param inLoserBracket Whether the match is in the loser bracket.
 * @param roundNumber The number of the current round.
 * @param roundCountLB The count of rounds in loser bracket.
 * @param matchCount The count of matches in the round.
 */
export function getSeedCount(inLoserBracket: boolean, roundNumber: number, roundCountLB: number, matchCount: number): number {
    ensureOrderingSupported(inLoserBracket, roundNumber, roundCountLB);

    return roundNumber === 1 ?
        matchCount * 2 : // Two per match for upper or lower bracket round 1.
        matchCount; // One per match for loser bracket minor rounds.
}

/**
 * Throws if the ordering is not supported on the given round number.
 *
 * @param inLoserBracket Whether the match is in the loser bracket.
 * @param roundNumber The number of the round.
 * @param roundCountLB The count of rounds in loser bracket.
 */
export function ensureOrderingSupported(inLoserBracket: boolean, roundNumber: number, roundCountLB: number): void {
    if (inLoserBracket && !isOrderingSupportedLoserBracket(roundNumber, roundCountLB))
        throw Error('This round does not support ordering.');

    if (!inLoserBracket && !isOrderingSupportedUpperBracket(roundNumber))
        throw Error('This round does not support ordering.');
}

/**
 * Indicates whether the ordering is supported in upper bracket, given the round number.
 *
 * @param roundNumber The number of the round.
 */
export function isOrderingSupportedUpperBracket(roundNumber: number): boolean {
    return roundNumber === 1;
}

/**
 * Indicates whether the ordering is supported in loser bracket, given the round number.
 *
 * @param roundNumber The number of the round.
 * @param roundCount The count of rounds.
 */
export function isOrderingSupportedLoserBracket(roundNumber: number, roundCount: number): boolean {
    return roundNumber === 1 || (roundNumber % 2 === 0 && roundNumber < roundCount);
}

/**
 * Returns the number of rounds an upper bracket has given the number of participants in the stage.
 *
 * @param participantCount The number of participants in the stage.
 */
export function getUpperBracketRoundCount(participantCount: number): number {
    return Math.log2(participantCount);
}

/**
 * Returns the count of round pairs (major & minor) in a loser bracket.
 *
 * @param participantCount The number of participants in the stage.
 */
export function getRoundPairCount(participantCount: number): number {
    return getUpperBracketRoundCount(participantCount) - 1;
}

/**
 * Determines whether a double elimination stage is really necessary.
 *
 * If the size is only two (less is impossible), then a lower bracket and a grand final are not necessary.
 *
 * @param participantCount The number of participants in the stage.
 */
export function isDoubleEliminationNecessary(participantCount: number): boolean {
    return participantCount > 2;
}

/**
 * Returns the real (because of loser ordering) number of a match in a loser bracket.
 *
 * @param participantCount The number of participants in a stage.
 * @param roundNumber Number of the round.
 * @param matchNumber Number of the match.
 * @param method The method used for the round.
 */
export function findLoserMatchNumber(participantCount: number, roundNumber: number, matchNumber: number, method?: SeedOrdering): number {
    const matchCount = getLoserRoundMatchCount(participantCount, roundNumber);
    const matchNumbers = Array.from(Array(matchCount), (_, i) => i + 1);
    const ordered = method ? ordering[method](matchNumbers) : matchNumbers;
    const actualMatchNumberLB = ordered.indexOf(matchNumber) + 1;
    return actualMatchNumberLB;
}

/**
 * Returns the count of matches in a round of a loser bracket.
 *
 * @param participantCount The number of participants in a stage.
 * @param roundNumber Number of the round.
 */
export function getLoserRoundMatchCount(participantCount: number, roundNumber: number): number {
    const roundPairIndex = Math.ceil(roundNumber / 2) - 1;
    const roundPairCount = getRoundPairCount(participantCount);
    const matchCount = Math.pow(2, roundPairCount - roundPairIndex - 1);
    return matchCount;
}

/**
 * Returns the ordering method of a round of a loser bracket.
 *
 * @param seedOrdering The list of seed orderings.
 * @param roundNumber Number of the round.
 */
export function getLoserOrdering(seedOrdering: SeedOrdering[], roundNumber: number): SeedOrdering | undefined {
    const orderingIndex = 1 + Math.floor(roundNumber / 2);
    return seedOrdering[orderingIndex];
}

/**
 * Returns the number of rounds a lower bracket has given the number of participants in a double elimination stage.
 *
 * @param participantCount The number of participants in the stage.
 */
export function lowerBracketRoundCount(participantCount: number): number {
    const roundPairCount = getRoundPairCount(participantCount);
    return roundPairCount * 2;
}

/**
 * Returns the match number of the corresponding match in the next round by dividing by two.
 *
 * @param matchNumber The current match number.
 */
export function getDiagonalMatchNumber(matchNumber: number): number {
    return Math.ceil(matchNumber / 2);
}

/**
 * Returns the nearest power of two **greater than** or equal to the given number.
 *
 * @param input The input number.
 */
export function getNearestPowerOfTwo(input: number): number {
    return Math.pow(2, Math.ceil(Math.log2(input)));
}

/**
 * Checks if a stage is a round-robin stage.
 *
 * @param stage The stage to check.
 */
export function isRoundRobin(stage: Stage): boolean {
    return stage.type === 'round_robin';
}

/**
 * Throws if a stage is round-robin.
 *
 * @param stage The stage to check.
 */
export function ensureNotRoundRobin(stage: Stage): void {
    const inRoundRobin = isRoundRobin(stage);
    if (inRoundRobin) throw Error('Impossible to update ordering in a round-robin stage.');
}

/**
 * Checks if a group is a winner bracket.
 *
 * It's not always the opposite of `inLoserBracket()`: it could be the only bracket of a single elimination stage.
 *
 * @param stageType Type of the stage.
 * @param groupNumber Number of the group.
 */
export function isWinnerBracket(stageType: StageType, groupNumber: number): boolean {
    return stageType === 'double_elimination' && groupNumber === 1;
}

/**
 * Checks if a group is a loser bracket.
 *
 * @param stageType Type of the stage.
 * @param groupNumber Number of the group.
 */
export function isLoserBracket(stageType: StageType, groupNumber: number): boolean {
    return stageType === 'double_elimination' && groupNumber === 2;
}

/**
 * Checks if a group is a final group (consolation final or grand final).
 *
 * @param stageType Type of the stage.
 * @param groupNumber Number of the group.
 */
export function isFinalGroup(stageType: StageType, groupNumber: number): boolean {
    return stageType === 'single_elimination' && groupNumber === 2 ||
        stageType === 'double_elimination' && groupNumber === 3;
}

/**
 * Returns the type of group the match is located into.
 *
 * @param stageType Type of the stage.
 * @param groupNumber Number of the group.
 */
export function getMatchLocation(stageType: StageType, groupNumber: number): BracketType {
    if (isWinnerBracket(stageType, groupNumber))
        return 'winner_bracket';

    if (isLoserBracket(stageType, groupNumber))
        return 'loser_bracket';

    if (isFinalGroup(stageType, groupNumber))
        return 'final_group';

    return 'single_bracket';
}

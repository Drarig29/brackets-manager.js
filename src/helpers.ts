import {
    GrandFinalType,
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

import { BracketKind, Database, Duel, FinalStandingsItem, IdMapping, Nullable, OmitId, ParitySplit, ParticipantSlot, Scores, Side } from './types';
import { ordering } from './ordering';

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
 * Normalizes IDs in a database.
 * 
 * Every ID - and references to it - is remapped to consecutive IDs starting from 0.
 * 
 * @param data Data to normalize.
 */
export function normalizeIds(data: Database): Database {
    const mappings = {
        participant: makeNormalizedIdMapping(data.participant),
        stage: makeNormalizedIdMapping(data.stage),
        group: makeNormalizedIdMapping(data.group),
        round: makeNormalizedIdMapping(data.round),
        match: makeNormalizedIdMapping(data.match),
        match_game: makeNormalizedIdMapping(data.match_game),
    };

    return {
        participant: data.participant.map(value => ({
            ...value,
            id: mappings.participant[value.id],
        })),
        stage: data.stage.map(value => ({
            ...value,
            id: mappings.stage[value.id],
        })),
        group: data.group.map(value => ({
            ...value,
            id: mappings.group[value.id],
            stage_id: mappings.stage[value.stage_id],
        })),
        round: data.round.map(value => ({
            ...value,
            id: mappings.round[value.id],
            stage_id: mappings.stage[value.stage_id],
            group_id: mappings.group[value.group_id],
        })),
        match: data.match.map(value => ({
            ...value,
            id: mappings.match[value.id],
            stage_id: mappings.stage[value.stage_id],
            group_id: mappings.group[value.group_id],
            round_id: mappings.round[value.round_id],
            opponent1: normalizeParticipant(value.opponent1, mappings.participant),
            opponent2: normalizeParticipant(value.opponent2, mappings.participant),
        })),
        match_game: data.match_game.map(value => ({
            ...value,
            id: mappings.match_game[value.id],
            stage_id: mappings.stage[value.stage_id],
            parent_id: mappings.match[value.parent_id],
            opponent1: normalizeParticipant(value.opponent1, mappings.participant),
            opponent2: normalizeParticipant(value.opponent2, mappings.participant),
        })),
    };
}

/**
 * Makes a mapping between old IDs and new normalized IDs.
 * 
 * @param elements A list of elements with IDs.
 */
export function makeNormalizedIdMapping(elements: { id: number }[]): IdMapping {
    let currentId = 0;

    return elements.reduce((acc, current) => ({
        ...acc,
        [current.id]: currentId++,
    }), {}) as IdMapping;
}

/**
 * Apply a normalizing mapping to a participant.
 * 
 * @param participant The participant.
 * @param mapping The mapping of IDs.
 */
export function normalizeParticipant(participant: ParticipantResult | null, mapping: IdMapping): ParticipantResult | null {
    if (participant === null) return null;

    return {
        ...participant,
        id: participant.id !== null ? mapping[participant.id] : null,
    };
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
 * Ensures there are no duplicates in a list of elements.
 * 
 * @param array A list of elements.
 */
export function ensureNoDuplicates<T>(array: Nullable<T>[]): void {
    const nonNull = getNonNull(array);
    const unique = [...new Set(nonNull)];

    if (unique.length < nonNull.length)
        throw new Error('The seeding has a duplicate participant.');
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
export function toResult(slot: ParticipantSlot): ParticipantSlot {
    return slot && {
        id: slot.id,
    };
}

/**
 * Converts a participant slot to a result stored in storage, with the position the participant is coming from.
 *
 * @param slot A participant slot.
 */
export function toResultWithPosition(slot: ParticipantSlot): ParticipantSlot {
    return slot && {
        id: slot.id,
        position: slot.position,
    };
}

/**
 * Returns the winner of a match.
 *
 * @param match The match.
 */
export function getWinner(match: MatchResults): ParticipantSlot {
    const winnerSide = getMatchResult(match);
    if (!winnerSide) return null;
    return match[winnerSide];
}

/**
 * Returns the loser of a match.
 *
 * @param match The match.
 */
export function getLoser(match: MatchResults): ParticipantSlot {
    const winnerSide = getMatchResult(match);
    if (!winnerSide) return null;
    return match[getOtherSide(winnerSide)];
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
    if (!isMatchCompleted(match))
        return null;

    if (isMatchDrawCompleted(match))
        return null;

    if (match.opponent1 === null && match.opponent2 === null)
        return null;

    let winner: Side | null = null;

    if (match.opponent1?.result === 'win' || match.opponent2 === null || match.opponent2.forfeit)
        winner = 'opponent1';

    if (match.opponent2?.result === 'win' || match.opponent1 === null || match.opponent1.forfeit) {
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
export function findPosition(matches: Match[], position: number): ParticipantSlot {
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
    return isMatchByeCompleted(match) || isMatchForfeitCompleted(match) || isMatchResultCompleted(match);
}

/**
 * Checks if a match is completed because of a forfeit.
 * 
 * @param match Partial match results.
 */
export function isMatchForfeitCompleted(match: Partial<MatchResults>): boolean {
    return match.opponent1?.forfeit !== undefined || match.opponent2?.forfeit !== undefined;
}

/**
 * Checks if a match is completed because of a either a draw or a win.
 * 
 * @param match Partial match results.
 */
export function isMatchResultCompleted(match: Partial<MatchResults>): boolean {
    return isMatchDrawCompleted(match) || isMatchWinCompleted(match);
}

/**
 * Checks if a match is completed because of a draw.
 * 
 * @param match Partial match results.
 */
export function isMatchDrawCompleted(match: Partial<MatchResults>): boolean {
    return match.opponent1?.result === 'draw' && match.opponent2?.result === 'draw';
}

/**
 * Checks if a match is completed because of a win.
 * 
 * @param match Partial match results.
 */
export function isMatchWinCompleted(match: Partial<MatchResults>): boolean {
    return match.opponent1?.result === 'win' || match.opponent2?.result === 'win'
        || match.opponent1?.result === 'loss' || match.opponent2?.result === 'loss';
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
 * Indicates whether a match has at least one BYE or not.
 * 
 * @param match Partial match results.
 */
export function hasBye(match: Partial<MatchResults>): boolean {
    return match.opponent1 === null || match.opponent2 === null;
}

/**
 * Returns the status of a match based on the opponents of a match.
 * 
 * @param opponents The opponents of a match.
 */
export function getMatchStatus(opponents: Duel): Status;

/**
 * Returns the status of a match based on the results of a match.
 *
 * @param match Partial match results.
 */
export function getMatchStatus(match: Partial<MatchResults>): Status;

/**
 * Returns the status of a match based on information about it.
 * 
 * @param arg The opponents or partial results of the match.
 */
export function getMatchStatus(arg: Duel | Partial<MatchResults>): Status {
    const match = Array.isArray(arg) ? {
        opponent1: arg[0],
        opponent2: arg[1],
    } : arg;

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
 */
export function setMatchResults(stored: MatchResults, match: Partial<MatchResults>): {
    statusChanged: boolean,
    resultChanged: boolean,
} {
    const completed = isMatchCompleted(match);
    const currentlyCompleted = isMatchCompleted(stored);

    handleOpponentsInversion(stored, match);

    const statusChanged = setScores(stored, match);

    if (completed && currentlyCompleted) {
        // Ensure everything is good.
        setCompleted(stored, match);
        return { statusChanged: false, resultChanged: true };
    }

    if (completed && !currentlyCompleted) {
        setCompleted(stored, match);
        return { statusChanged: true, resultChanged: true };
    }

    if (!completed && currentlyCompleted) {
        resetMatchResults(stored);
        return { statusChanged: true, resultChanged: true };
    }

    return { statusChanged, resultChanged: false };
}

/**
 * Resets the results of a match. (status, forfeit, result)
 *
 * @param stored A reference to what will be updated in the storage.
 */
export function resetMatchResults(stored: MatchResults): void {
    if (stored.opponent1) {
        stored.opponent1.forfeit = undefined;
        stored.opponent1.result = undefined;
    }

    if (stored.opponent2) {
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
export function getOpponentId(match: MatchResults, side: Side): number | null {
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
 * Returns every loser in a list of matches.
 * 
 * @param participants The list of participants.
 * @param matches A list of matches to get losers of.
 */
export function getLosers(participants: Participant[], matches: Match[]): Participant[][] {
    const losers: Participant[][] = [];

    let currentRound: number | null = null;
    let roundIndex = -1;

    for (const match of matches) {
        if (match.round_id !== currentRound) {
            currentRound = match.round_id;
            roundIndex++;
            losers[roundIndex] = [];
        }

        const loser = getLoser(match);
        if (loser === null)
            continue;

        losers[roundIndex].push(findParticipant(participants, loser));
    }

    return losers;
}

/**
 * Makes final standings based on participants grouped by ranking.
 * 
 * @param grouped A list of participants grouped by ranking.
 */
export function makeFinalStandings(grouped: Participant[][]): FinalStandingsItem[] {
    const standings: FinalStandingsItem[] = [];

    let rank = 1;

    for (const group of grouped) {
        for (const participant of group) {
            standings.push({
                id: participant.id,
                name: participant.name,
                rank,
            });
        }
        rank++;
    }

    return standings;
}

/**
 * Returns the decisive match of a Grand Final.
 * 
 * @param type The type of Grand Final.
 * @param matches The matches in the Grand Final.
 */
export function getGrandFinalDecisiveMatch(type: GrandFinalType, matches: Match[]): Match {
    if (type === 'simple')
        return matches[0];

    if (type === 'double') {
        const result = getMatchResult(matches[0]);

        if (result === 'opponent2')
            return matches[1];

        return matches[0];
    }

    throw Error('The Grand Final is disabled.');
}

/**
 * Finds a participant in a list.
 * 
 * @param participants The list of participants.
 * @param slot The slot of the participant to find.
 */
export function findParticipant(participants: Participant[], slot: ParticipantSlot): Participant {
    const participant = participants.find(participant => participant.id === slot?.id);
    if (!participant) throw Error('Participant not found.');
    return participant;
}

/**
 * Gets the side the winner of the current match will go to in the next match.
 *
 * @param matchNumber Number of the current match.
 * @param roundNumber Number of the current round.
 * @param roundCount Count of rounds.
 * @param matchLocation Location of the current match.
 */
export function getNextSide(matchNumber: number, roundNumber: number, roundCount: number, matchLocation: BracketKind): Side {
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

export type SetNextOpponent = (nextMatch: Match, nextSide: Side, match?: Match, currentSide?: Side) => void;

/**
 * Sets an opponent in the next match he has to go.
 *
 * @param nextMatch A match which follows the current one.
 * @param nextSide The side the opponent will be on in the next match.
 * @param match The current match.
 * @param currentSide The side the opponent is currently on.
 */
export function setNextOpponent(nextMatch: Match, nextSide: Side, match?: Match, currentSide?: Side): void {
    nextMatch[nextSide] = match![currentSide!] && { // Keep BYE.
        id: getOpponentId(match!, currentSide!), // This implementation of SetNextOpponent always has those arguments.
        position: nextMatch[nextSide]?.position, // Keep position.
    };

    nextMatch.status = getMatchStatus(nextMatch);
}

/**
 * Resets an opponent in the match following the current one.
 *
 * @param nextMatch A match which follows the current one.
 * @param nextSide The side the opponent will be on in the next match.
 */
export function resetNextOpponent(nextMatch: Match, nextSide: Side): void {
    nextMatch[nextSide] = nextMatch[nextSide] && { // Keep BYE.
        id: null,
        position: nextMatch[nextSide]?.position, // Keep position.
    };

    nextMatch.status = Status.Locked;
}

/**
 * Inverts opponents if requested by the input.
 * 
 * @param stored A reference to what will be updated in the storage.
 * @param match Input of the update.
 */
export function handleOpponentsInversion(stored: MatchResults, match: Partial<MatchResults>): void {
    const id1 = match.opponent1?.id;
    const id2 = match.opponent2?.id;

    const storedId1 = stored.opponent1?.id;
    const storedId2 = stored.opponent2?.id;

    if (Number.isInteger(id1) && id1 !== storedId1 && id1 !== storedId2)
        throw Error('The given opponent1 ID does not exist in this match.');

    if (Number.isInteger(id2) && id2 !== storedId1 && id2 !== storedId2)
        throw Error('The given opponent2 ID does not exist in this match.');

    if (Number.isInteger(id1) && id1 === storedId2 || Number.isInteger(id2) && id2 === storedId1)
        invertOpponents(match);
}

/**
 * Inverts `opponent1` and `opponent2` in a match.
 * 
 * @param match A match to update.
 */
export function invertOpponents(match: Partial<MatchResults>): void {
    [match.opponent1, match.opponent2] = [match.opponent2, match.opponent1];
}

/**
 * Updates the scores of a match.
 *
 * @param stored A reference to what will be updated in the storage.
 * @param match Input of the update.
 * @returns `true` if the status of the match changed, `false` otherwise.
 */
export function setScores(stored: MatchResults, match: Partial<MatchResults>): boolean {
    // Skip if no score update.
    if (match.opponent1?.score === stored.opponent1?.score && match.opponent2?.score === stored.opponent2?.score)
        return false;

    const oldStatus = stored.status;
    stored.status = Status.Running;

    if (match.opponent1 && stored.opponent1)
        stored.opponent1.score = match.opponent1.score;

    if (match.opponent2 && stored.opponent2)
        stored.opponent2.score = match.opponent2.score;

    return stored.status !== oldStatus;
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
 * Enforces the symmetry between opponents.
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
 * Indicates if a seeding is filled with participants' names or IDs.
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
 * Returns only the non null elements.
 * 
 * @param array The array to process.
 */
export function getNonNull<T>(array: Nullable<T>[]): T[] {
    // Use a TS type guard to exclude null from the resulting type.
    const nonNull = array.filter((element): element is T => element !== null);
    return nonNull;
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
        if (!value) return true;
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
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
 * @param parent The partial parent match to update.
 * @param childCount Child count of this parent match.
 * @param inRoundRobin Indicates whether the parent match is in a round-robin stage.
 */
export function setParentMatchCompleted(parent: Partial<MatchResults>, childCount: number, inRoundRobin: boolean): void {
    if (parent.opponent1?.score === undefined || parent.opponent2?.score === undefined)
        throw Error('Either opponent1, opponent2 or their scores are falsy.');

    const minToWin = minScoreToWinBestOfX(childCount);

    if (parent.opponent1.score >= minToWin) {
        parent.opponent1.result = 'win';
        return;
    }

    if (parent.opponent2.score >= minToWin) {
        parent.opponent2.result = 'win';
        return;
    }

    if (parent.opponent1.score === parent.opponent2.score && parent.opponent1.score + parent.opponent2.score > childCount - 1) {
        if (inRoundRobin) {
            parent.opponent1.result = 'draw';
            parent.opponent2.result = 'draw';
            return;
        }

        throw Error('Match games result in a tie for the parent match.');
    }
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
 * @param existing The base match.
 */
export function getUpdatedMatchResults<T extends MatchResults>(match: T, existing: T): T {
    return {
        ...existing,
        ...match,
        opponent1: { ...existing.opponent1, ...match.opponent1 },
        opponent2: { ...existing.opponent2, ...match.opponent2 },
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
export function getLowerBracketRoundCount(participantCount: number): number {
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
 * Returns the minimum score a participant must have to win a Best Of X series match.
 * 
 * @param x The count of child games in the series.
 */
function minScoreToWinBestOfX(x: number): number {
    return (x + 1) / 2;
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
export function getMatchLocation(stageType: StageType, groupNumber: number): BracketKind {
    if (isWinnerBracket(stageType, groupNumber))
        return 'winner_bracket';

    if (isLoserBracket(stageType, groupNumber))
        return 'loser_bracket';

    if (isFinalGroup(stageType, groupNumber))
        return 'final_group';

    return 'single_bracket';
}

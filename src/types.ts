import { CrudInterface, DataTypes, Id, RankingFormula, RankingItem, SeedOrdering, Table } from 'brackets-model';

/**
 * Type of an object implementing every ordering method.
 */
export type OrderingMap = Record<SeedOrdering, <T>(array: T[], ...args: number[]) => T[]>;

/**
 * Defines a T which can be null.
 */
export type Nullable<T> = T | null;

/**
 * An object which maps an ID to another ID.
 */
export type IdMapping = Record<Id, Id>;

/**
 * Used by the library to handle placements. Is `null` if is a BYE. Has a `null` name if it's yet to be determined.
 */
export type ParticipantSlot = { id: Id | null, position?: number } | null;

/**
 * The library only handles duels. It's one participant versus another participant.
 */
export type Duel = [ParticipantSlot, ParticipantSlot];

/**
 * The side of an opponent.
 */
export type Side = 'opponent1' | 'opponent2';

/**
 * The cumulated scores of the opponents in a match's child games.
 */
export type Scores = { opponent1: number, opponent2: number };

/**
 * The cumulated results of a match's child games.
 */
export interface ChildGameResults extends Scores {
    /**
     * The count of match games cancelled as spent games.
     */
    spent: number,

    /**
     * Whether a match game cancelled the whole parent match as a double forfeit.
     */
    doubleForfeit: boolean,
}

/**
 * The possible levels of data to which we can update the child games count.
 */
export type ChildCountLevel = 'stage' | 'group' | 'round' | 'match';

/**
 * Options for cancelling a match game.
 */
export interface MatchGameCancellationOptions {
    /**
     * How cancelling a match game should affect its parent match.
     *
     * - `spent_game`: Consumes one Best-of-X game without awarding it to either opponent.
     * - `double_forfeit`: Disqualifies both opponents from the parent match.
     */
    mode: 'spent_game' | 'double_forfeit',
}

/**
 * Positional information about a round.
 */
export type RoundPositionalInfo = {
    roundNumber: number,
    roundCount: number,
};

/**
 * The result of an array which was split by parity.
 */
export interface ParitySplit<T> {
    even: T[],
    odd: T[],
}

/**
 * Makes an object type deeply partial.
 */
export type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;

/**
 * The storage methods which can mutate entities.
 */
export type EntityChangeMethod = 'insert' | 'update' | 'delete';

/**
 * An event emitted after a storage mutation succeeds.
 */
export interface EntityChangedEvent<T extends Table = Table> {
    id: string,
    method: EntityChangeMethod,
    table: T,
    args: unknown[],
    result: unknown,
    duration: number,
}

/**
 * An item in the final standings of an elimination stage. Each item represents a participant.
 */
export interface FinalStandingsItem {
    id: Id,
    name: string,
    rank: number,
}

/**
 * An item in the final standings of a round-robin stage. Each item represents a participant.
 */
export interface RoundRobinFinalStandingsItem extends RankingItem {
    groupId: Id,
    name: string
}

/**
 * Options for the final standings of a round-robin stage.
 */
export interface RoundRobinFinalStandingsOptions {
    /**
     * A formula required to rank participants in a round-robin stage.
     * 
     * See {@link RankingItem} for the possible properties on `item`.
     * 
     * The default formula used by the viewer is:
     *
     * @example (item) => 3 * item.wins + 1 * item.draws + 0 * item.losses
     */
    rankingFormula: RankingFormula,
    /**
     * The maximum number of participants to qualify per group.
     */
    maxQualifiedParticipantsPerGroup?: number,
}

/**
 * Contains the losers and the winner of the bracket.
 */
export interface StandardBracketResults {
    /**
     * The list of losers for each round of the bracket.
     */
    losers: ParticipantSlot[][],

    /**
     * The winner of the bracket.
     */
    winner: ParticipantSlot,
}

export interface Storage extends CrudInterface {
    selectFirst<T extends Table>(table: T, filter: Partial<DataTypes[T]>, assertUnique?: boolean): Promise<DataTypes[T] | null>
    selectLast<T extends Table>(table: T, filter: Partial<DataTypes[T]>, assertUnique?: boolean): Promise<DataTypes[T] | null>
}

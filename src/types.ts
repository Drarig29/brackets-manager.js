import { Group, Id, Match, MatchGame, Participant, Round, SeedOrdering, Stage, RankingFormula, RankingItem } from 'brackets-model';

/**
 * Type of an object implementing every ordering method.
 */
export type OrderingMap = Record<SeedOrdering, <T>(array: T[], ...args: number[]) => T[]>;

/**
 * Omits the `id` property of a type.
 */
export type OmitId<T> = Omit<T, 'id'>;

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
 * The possible levels of data to which we can update the child games count.
 */
export type ChildCountLevel = 'stage' | 'group' | 'round' | 'match';

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
 * Converts all value types to array types.
 */
export type ValueToArray<T> = {
    [K in keyof T]: Array<T[K]>;
};

/**
 * Data type associated to each database table.
 */
export interface DataTypes {
    stage: Stage,
    group: Group,
    round: Round,
    match: Match,
    match_game: MatchGame,
    participant: Participant,
}

/**
 * The types of table in the storage.
 */
export type Table = keyof DataTypes;

/**
 * Format of the data in a database.
 */
export type Database = ValueToArray<DataTypes>;

/**
 * An item in the final standings of an elimination stage. Each item represents a {@link Participant}.
 */
export interface FinalStandingsItem {
    id: Id,
    name: string,
    rank: number,
}

/**
 * An item in the final standings of a round-robin stage. Each item represents a {@link Participant}.
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

/**
 * This CRUD interface is used by the manager to abstract storage.
 */
export interface CrudInterface {
    /**
     * Inserts a value in the database and returns its id.
     *
     * @param table Where to insert.
     * @param value What to insert.
     */
    insert<T extends Table>(table: T, value: OmitId<DataTypes[T]>): Promise<number>

    /**
     * Inserts multiple values in the database.
     *
     * @param table Where to insert.
     * @param values What to insert.
     */
    insert<T extends Table>(table: T, values: OmitId<DataTypes[T]>[]): Promise<boolean>

    /**
     * Gets all data from a table in the database.
     *
     * @param table Where to get from.
     */
    select<T extends Table>(table: T): Promise<Array<DataTypes[T]> | null>

    /**
     * Gets specific data from a table in the database.
     *
     * @param table Where to get from.
     * @param id What to get.
     */
    select<T extends Table>(table: T, id: Id): Promise<DataTypes[T] | null>

    /**
     * Gets data from a table in the database with a filter.
     *
     * @param table Where to get from.
     * @param filter An object to filter data.
     */
    select<T extends Table>(table: T, filter: Partial<DataTypes[T]>): Promise<Array<DataTypes[T]> | null>

    /**
     * Updates data in a table.
     *
     * @param table Where to update.
     * @param id What to update.
     * @param value How to update.
     */
    update<T extends Table>(table: T, id: Id, value: DataTypes[T]): Promise<boolean>

    /**
     * Updates data in a table.
     *
     * @param table Where to update.
     * @param filter An object to filter data.
     * @param value How to update.
     */
    update<T extends Table>(table: T, filter: Partial<DataTypes[T]>, value: Partial<DataTypes[T]>): Promise<boolean>

    /**
     * Empties a table completely.
     * 
     * @param table Where to delete everything.
     */
    delete<T extends Table>(table: T): Promise<boolean>

    /**
     * Delete data in a table, based on a filter.
     *
     * @param table Where to delete in.
     * @param filter An object to filter data.
     */
    delete<T extends Table>(table: T, filter: Partial<DataTypes[T]>): Promise<boolean>
}

export interface Storage extends CrudInterface {
    selectFirst<T extends Table>(table: T, filter: Partial<DataTypes[T]>, assertUnique?: boolean): Promise<DataTypes[T] | null>
    selectLast<T extends Table>(table: T, filter: Partial<DataTypes[T]>, assertUnique?: boolean): Promise<DataTypes[T] | null>
}

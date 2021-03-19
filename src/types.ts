import { Group, Match, Participant, Round, SeedOrdering, Stage } from 'brackets-model';

/**
 * Type of an object implementing every ordering method.
 */
export type OrderingMap = { [key in SeedOrdering]: <T>(array: T[], ...args: number[]) => T[] };

/**
 * Omits the `id` property of a type.
 */
export type OmitId<T> = Omit<T, 'id'>;

/**
 * Used by the library to handle placements. Is `null` if is a BYE. Has a `null` name if it's yet to be determined.
 */
export type ParticipantSlot = { id: number | null, position?: number } | null;

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
 * All the data linked to a stage.
 */
export interface StageData {
    stage: Stage,
    groups: Group[],
    rounds: Round[],
    matches: Match[],
    participants: Participant[],
}

/**
 * An item in the final standings of an elimination stage.
 */
export interface FinalStandingsItem {
    id: number,
    name: string,
    rank: number,
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
 * The types of table in the storage.
 */
export type Table = 'participant' | 'stage' | 'group' | 'round' | 'match' | 'match_game';

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
    insert<T>(table: Table, value: OmitId<T>): Promise<number>

    /**
     * Inserts multiple values in the database.
     *
     * @param table Where to insert.
     * @param values What to insert.
     */
    insert<T>(table: Table, values: OmitId<T>[]): Promise<boolean>

    /**
     * Gets all data from a table in the database.
     *
     * @param table Where to get from.
     */
    select<T>(table: Table): Promise<T[] | null>

    /**
     * Gets specific data from a table in the database.
     *
     * @param table Where to get from.
     * @param id What to get.
     */
    select<T>(table: Table, id: number): Promise<T | null>

    /**
     * Gets data from a table in the database with a filter.
     *
     * @param table Where to get from.
     * @param filter An object to filter data.
     */
    select<T>(table: Table, filter: Partial<T>): Promise<T[] | null>

    /**
     * Updates data in a table.
     *
     * @param table Where to update.
     * @param id What to update.
     * @param value How to update.
     */
    update<T>(table: Table, id: number, value: T): Promise<boolean>

    /**
     * Updates data in a table.
     *
     * @param table Where to update.
     * @param filter An object to filter data.
     * @param value How to update.
     */
    update<T>(table: Table, filter: Partial<T>, value: Partial<T>): Promise<boolean>

    /**
     * Delete data in a table, based on a filter.
     *
     * @param table Where to delete in.
     * @param filter An object to filter data.
     */
    delete<T>(table: Table, filter: Partial<T>): Promise<boolean>

    /**
     * Imports given data and replaces the current bracket database.
     *
     * @param data Data to import.
     */
    import(data: StageData): Promise<boolean>
}

export interface Storage extends CrudInterface {
    selectFirst<T>(table: Table, filter: Partial<T>): Promise<T | null>
    selectLast<T>(table: Table, filter: Partial<T>): Promise<T | null>
}

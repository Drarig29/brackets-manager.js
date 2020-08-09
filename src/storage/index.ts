export type Table = 'participant' | 'stage' | 'group' | 'round' | 'match' | 'match_game';

/**
 * This CRUD interface is used by the manager to abstract storage.
 */
export interface IStorage {
    /**
     * Inserts a value in the database and returns its id.
     * @param table Where to insert.
     * @param value What to insert.
     */
    insert<T>(table: Table, value: OmitId<T>): Promise<number>

    /**
     * Inserts multiple values in the database.
     * @param table Where to insert.
     * @param values What to insert.
     */
    insert<T>(table: Table, values: OmitId<T>[]): Promise<boolean>

    /**
     * Gets all data from a table in the database. 
     * @param table Where to get from.
     */
    select<T>(table: Table): Promise<T[] | null>

    /**
     * Gets specific data from a table in the database.
     * @param table Where to get from.
     * @param id What to get.
     */
    select<T>(table: Table, id: number): Promise<T | null>

    /**
     * Gets data from a table in the database with a filter.
     * @param table Where to get from.
     * @param filter An object to filter data.
     */
    select<T>(table: Table, filter: Partial<T>): Promise<T[] | null>

    /**
     * Updates data in a table.
     * @param table Where to update.
     * @param id What to update.
     * @param value How to update.
     */
    update<T>(table: Table, id: number, value: T): Promise<boolean>

    /**
     * Updates data in a table.
     * @param table Where to update.
     * @param filter An object to filter data.
     * @param value How to update.
     */
    update<T>(table: Table, filter: Partial<T>, value: Partial<T>): Promise<boolean>

    /**
     * Delete data in a table, based on a filter.
     * @param table Where to delete in.
     * @param filter An object to filter data.
     */
    delete<T>(table: Table, filter: Partial<T>): Promise<boolean>
}
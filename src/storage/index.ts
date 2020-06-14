declare type Predicate<T> = (entry: T, index: number) => boolean;

export interface IStorage {
    /**
     * Inserts a value in the database and returns its id.
     * @param table Where to insert.
     * @param value What to insert.
     */
    insert<T>(table: string, value: T): Promise<number>

    /**
     * Inserts multiple values in the database.
     * @param table Where to insert.
     * @param values What to insert.
     */
    insert<T>(table: string, values: T[]): Promise<boolean>

    /**
     * Gets all data from a table in the database. 
     * @param table Where to get from.
     */
    select<T>(table: string): Promise<T[] | null>

    /**
     * Gets specific data from a table in the database.
     * @param table Where to get from.
     * @param id What to get.
     */
    select<T>(table: string, id: number): Promise<T | null>

    /**
     * Gets data from a table in the database with a filter.
     * @param table Where to get from.
     * @param pred A predicate to filter data.
     */
    select<T>(table: string, pred: Predicate<T>): Promise<T[] | null>

    /**
     * Updates data in a table.
     * @param table Where to update.
     * @param id What to update.
     * @param value How to update.
     */
    update<T>(table: string, id: number, value: T): Promise<boolean>
}
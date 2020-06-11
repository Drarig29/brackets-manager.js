declare type Predicate<T> = (entry: T, index: number) => boolean;

export interface IStorage {
    /**
     * Inserts a value in the database and returns its id.
     * @param table Where to insert.
     * @param value What to insert.
     */
    insert<T>(table: string, value: T): number

    /**
     * Inserts multiple values in the database.
     * @param table Where to insert.
     * @param values What to insert.
     */
    insert<T>(table: string, values: T[]): void

    /**
     * Gets all data from a table in the database. 
     * @param table Where to get from.
     */
    select<T>(table: string): T[] | undefined

    /**
     * Gets specific data from a table in the database.
     * @param table Where to get from.
     * @param id What to get.
     */
    select<T>(table: string, id: number): T | undefined

    /**
     * Gets data from a table in the database with a filter.
     * @param table Where to get from.
     * @param pred A predicate to filter data.
     */
    select<T>(table: string, pred: Predicate<T>): T[] | undefined

    /**
     * Updates data in a table.
     * @param table Where to update.
     * @param id What to update.
     * @param value How to update.
     */
    update<T>(table: string, id: number, value: T): void;
}
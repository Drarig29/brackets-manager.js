import { JsonDB } from 'node-json-db';
import { CrudInterface, Table } from '.';

type StringIndexedObject = {
    [key: string]: unknown;
};

type Filter<T> = (obj: T) => boolean;

class JsonDatabase implements CrudInterface {

    private internal: JsonDB;

    /**
     * Creates an instance of JsonDatabase, an implementation of CrudInterface for a json file.
     */
    constructor() {
        this.internal = new JsonDB('db.json', true, true);
        this.init()
    }

    /**
     * Creates the array if it doesn't exist.
     *
     * @param table The table to check.
     */
    private ensureArrayExists(table: Table): void {
        const path = this.makePath(table);

        if (!this.internal.exists(path))
            this.internal.push(path, []);
    }

    /**
     * Initiates the storage.
     */
    private init(): void {
        this.ensureArrayExists('participant');
        this.ensureArrayExists('stage');
        this.ensureArrayExists('group');
        this.ensureArrayExists('round');
        this.ensureArrayExists('match');
        this.ensureArrayExists('match_game');
    }

    /**
     * Creates the path of a table.
     *
     * @param table Name of the table.
     */
    private makePath(table: Table): string {
        return `/${table}`;
    }

    /**
     * Creates the path of an array.
     *
     * @param table Name of the table.
     */
    private makeArrayPath(table: Table): string {
        return `/${table}[]`;
    }

    /**
     * Creates the path of an element at a given index in an array.
     *
     * @param table Name of the table.
     * @param index Index of the element.
     */
    private makeArrayIndexPath(table: Table, index: number): string {
        return `/${table}[${index}]`;
    }

    /**
     * Makes the filter function associated to the partial object.
     *
     * @param partial A partial object with given values as query.
     */
    private makeFilter<T extends StringIndexedObject>(partial: Partial<T>): Filter<T> {
        return (obj: T): boolean => {
            let result = true;

            for (const [key, value] of Object.entries(partial))
                result = result && obj[key] === value;

            return result;
        };
    }

    /**
     * Empties the database and `init()` it back.
     */
    public reset(): void {
        this.internal.resetData({});
        this.init();
    }

    /**
     * Inserts a value in a table and returns its id.
     *
     * @param table Where to insert.
     * @param value What to insert.
     */
    public insert<T>(table: Table, value: T): Promise<number>;

    /**
     * Inserts multiple values in a table.
     *
     * @param table Where to insert.
     * @param values What to insert.
     */
    public insert<T>(table: Table, values: T[]): Promise<boolean>;

    /**
     * Inserts a unique value or multiple values in a table.
     *
     * @param table Name of the table.
     * @param arg A single value or an array of values.
     */
    public async insert<T>(table: Table, arg: T | T[]): Promise<number | boolean> {
        let id = this.internal.getData(this.makePath(table)).length;

        if (!Array.isArray(arg)) {
            try {
                this.internal.push(this.makeArrayPath(table), { id, ...arg });
            } catch (error) {
                return -1;
            }

            return id;
        }

        try {
            this.internal.push(this.makePath(table), arg.map(object => ({ id: id++, ...object })));
        } catch (error) {
            return false;
        }

        return true;
    }

    /**
     * Gets all data from a table. 
     *
     * @param table Where to get from.
     */
    public select<T>(table: Table): Promise<T[] | null>;

    /**
     * Gets specific data from a table.
     *
     * @param table Where to get from.
     * @param id What to get.
     */
    public select<T>(table: Table, key: number): Promise<T | null>;

    /**
     * Gets data from a table with a filter.
     *
     * @param table Where to get from.
     * @param filter An object to filter data.
     */
    public select<T>(table: Table, filter: Partial<T>): Promise<T[] | null>

    /**
     * Gets a unique elements, elements matching a filter or all the elements in a table.
     * 
     * @param table Name of the table.
     * @param arg An index or a filter.
     */
    public async select<T>(table: Table, arg?: number | Partial<T>): Promise<T | T[] | null> {
        try {
            if (arg === undefined)
                return this.internal.getData(this.makePath(table));

            if (typeof arg === 'number')
                return this.internal.getData(this.makeArrayIndexPath(table, arg));

            return this.internal.filter(this.makePath(table), this.makeFilter(arg)) || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Updates data in a table.
     *
     * @param table Where to update.
     * @param id What to update.
     * @param value How to update.
     */
    public update<T>(table: Table, key: number, value: T): Promise<boolean>;

    /**
     * Updates data in a table.
     *
     * @param table Where to update.
     * @param filter An object to filter data.
     * @param value How to update.
     */
    public update<T>(table: Table, filter: Partial<T>, value: Partial<T>): Promise<boolean>;

    /**
     * Updates one or multiple elements in a table.
     * 
     * @param table Name of the table.
     * @param arg An index or a filter.
     * @param value The whole object if arg is an index or the values to change if arg is a filter.
     */
    public async update<T>(table: Table, arg: number | Partial<T>, value: T | Partial<T>): Promise<boolean> {
        if (typeof arg === 'number') {
            try {
                this.internal.push(this.makeArrayIndexPath(table, arg), value);
                return true;
            } catch (error) {
                return false;
            }
        }

        const values = this.internal.filter<{ id: number }>(this.makePath(table), this.makeFilter(arg));
        if (!values) return false;

        values.forEach(v => this.internal.push(this.makeArrayIndexPath(table, v.id), value, false));
        return true;
    }

    /**
     * Delete data in a table, based on a filter.
     *
     * @param table Where to delete in.
     * @param filter An object to filter data.
     */
    public async delete<T extends { [key: string]: unknown }>(table: Table, filter: Partial<T>): Promise<boolean> {
        const path = this.makePath(table);
        const values: T[] = this.internal.getData(path);
        if (!values) return false;

        const predicate = this.makeFilter(filter);

        this.internal.push(path, values.filter(value => !predicate(value)));
        return true;
    }
}

export const storage = new JsonDatabase();
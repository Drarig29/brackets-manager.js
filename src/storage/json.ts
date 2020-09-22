import { JsonDB } from "node-json-db";
import { CrudInterface, Table } from ".";

class JsonDatabase implements CrudInterface {

    private internal: JsonDB;

    constructor() {
        this.internal = new JsonDB('db.json', true, true);
        this.init()
    }

    private ensureArrayExists(table: Table) {
        const path = this.makePath(table);

        if (!this.internal.exists(path))
            this.internal.push(path, []);
    }

    private init() {
        this.ensureArrayExists('participant');
        this.ensureArrayExists('stage');
        this.ensureArrayExists('group');
        this.ensureArrayExists('round');
        this.ensureArrayExists('match');
        this.ensureArrayExists('match_game');
    }

    private makePath(table: Table): string {
        return `/${table}`;
    }

    private makeArrayPath(table: Table): string {
        return `/${table}[]`;
    }

    private makeArrayIndexPath(table: Table, index: number): string {
        return `/${table}[${index}]`;
    }

    private makeArrayPropertyPath(table: Table, index: number, property: string): string {
        return `/${table}[${index}]/${property}`;
    }

    private makeFilter(partial: any) {
        return (entry: any): boolean => {
            let result = true;

            for (const [key, value] of Object.entries(partial)) {
                result = result && entry[key] === value;
            }

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
     * Inserts a value in the database and returns its id.
     * @param table Where to insert.
     * @param value What to insert.
     */
    public insert<T>(table: Table, value: T): Promise<number>;

    /**
     * Inserts multiple values in the database.
     * @param table Where to insert.
     * @param values What to insert.
     */
    public insert<T>(table: Table, values: T[]): Promise<boolean>;

    public async insert(table: Table, arg: any): Promise<number | boolean> {
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
     * Gets all data from a table in the database. 
     * @param table Where to get from.
     */
    public select<T>(table: Table): Promise<T[] | null>;

    /**
     * Gets specific data from a table in the database.
     * @param table Where to get from.
     * @param id What to get.
     */
    public select<T>(table: Table, key: number): Promise<T | null>;

    /**
     * Gets data from a table in the database with a filter.
     * @param table Where to get from.
     * @param filter An object to filter data.
     */
    public select<T>(table: Table, filter: Partial<T>): Promise<T[] | null>

    public async select<T>(table: Table, arg?: any): Promise<T | T[] | null> {
        try {
            if (arg === undefined)
                return this.internal.getData(this.makePath(table));

            if (typeof arg === "number")
                return this.internal.getData(this.makeArrayIndexPath(table, arg));

            return this.internal.filter(this.makePath(table), this.makeFilter(arg)) || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Updates data in a table.
     * @param table Where to update.
     * @param id What to update.
     * @param value How to update.
     */
    public update<T>(table: Table, key: number, value: T): Promise<boolean>;

    /**
     * Updates data in a table.
     * @param table Where to update.
     * @param filter An object to filter data.
     * @param value How to update.
     */
    public update<T>(table: Table, filter: Partial<T>, value: Partial<T>): Promise<boolean>;

    public async update<T>(table: Table, arg: any, value: T | Partial<T>) {
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
     * @param table Where to delete in.
     * @param filter An object to filter data.
     */
    public async delete<T>(table: Table, filter: Partial<T>): Promise<boolean> {
        const path = this.makePath(table);
        const values: T[] = this.internal.getData(path);
        if (!values) return false;

        const predicate = this.makeFilter(filter);
        const oppositeFilter = (value: any) => !predicate(value);

        this.internal.push(path, values.filter(oppositeFilter));
        return true;
    }
}

export const storage = new JsonDatabase();
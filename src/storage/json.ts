import { JsonDB } from "node-json-db";
import { IStorage } from ".";

class JsonDatabase implements IStorage {

    private internal: JsonDB;

    constructor() {
        this.internal = new JsonDB('db.json', true, true);
        this.init()
    }

    private ensureArrayExists(table: string) {
        table = this.makePath(table);

        if (!this.internal.exists(table))
            this.internal.push(table, []);
    }

    private init() {
        this.ensureArrayExists('participant');
        this.ensureArrayExists('stage');
        this.ensureArrayExists('group');
        this.ensureArrayExists('round');
        this.ensureArrayExists('match');
        this.ensureArrayExists('match_game');
    }

    private makePath(table: string): string {
        return `/${table}`;
    }

    private makeArrayPath(table: string): string {
        return `/${table}[]`;
    }

    private makeArrayAccessor(table: string, index: number): string {
        return `/${table}[${index}]`;
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
    public insert<T>(table: string, value: T): Promise<number>;

    /**
     * Inserts multiple values in the database.
     * @param table Where to insert.
     * @param values What to insert.
     */
    public insert<T>(table: string, values: T[]): Promise<boolean>;

    public async insert(table: string, arg: any): Promise<number | boolean> {
        let id: number = this.internal.getData(this.makePath(table)).length;

        if (!Array.isArray(arg)) {
            this.internal.push(this.makeArrayPath(table), { id, ...arg });
            return id;
        }

        try {
            this.internal.push(this.makePath(table), arg.map(object => ({ id: id++, ...object })));
        } catch (error) {
            return false;
        }

        return true;
    }

    public select<T>(table: string): Promise<T[] | null>;
    public select<T>(table: string, key: number): Promise<T | null>;
    public select<T>(table: string, filter: Partial<T>): Promise<T[] | null>

    public async select<T>(table: string, arg?: any): Promise<T | T[] | null> {
        try {
            if (arg === undefined)
                return this.internal.getData(this.makePath(table));

            if (typeof arg === "number")
                return this.internal.getData(this.makeArrayAccessor(table, arg));

            return this.internal.filter(this.makePath(table), this.makeFilter(arg)) || null;
        } catch (error) {
            return null;
        }
    }

    public async update<T>(table: string, key: number, value: T): Promise<boolean> {
        try {
            this.internal.push(this.makeArrayAccessor(table, key), value);
        } catch (error) {
            return false;
        }

        return true;
    }
}

export const storage = new JsonDatabase();
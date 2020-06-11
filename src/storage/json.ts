import { JsonDB } from "node-json-db";
import { IStorage } from ".";

export declare type SelectCallback<T> = (entry: T, index: number) => boolean

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
    public insert<T>(table: string, value: T): number;

    /**
     * Inserts multiple values in the database.
     * @param table Where to insert.
     * @param values What to insert.
     */
    public insert<T>(table: string, values: T[]): void;

    public insert(table: string, arg: any) {
        let id = this.internal.getData(this.makePath(table)).length;

        if (!Array.isArray(arg)) {
            this.internal.push(this.makeArrayPath(table), { id, ...arg });
            return id;
        }

        this.internal.push(this.makePath(table), arg.map(object => ({ id: id++, ...object })));
    }

    public select<T>(table: string): T[] | undefined
    public select<T>(table: string, key: number): T | undefined;
    public select<T>(table: string, pred: SelectCallback<T>): T[] | undefined;

    public select(table: string, arg?: any): any {
        if (arg === undefined)
            return this.internal.getData(this.makePath(table));

        if (typeof arg === "number")
            return this.internal.getData(this.makeArrayAccessor(table, arg));

        return this.internal.filter(this.makePath(table), arg);
    }

    public update<T>(table: string, key: number, property: string, value: T): void;
    public update<T>(table: string, key: number, value: T): void;

    public update(table: string, key: number, arg1: any, arg2?: any): void {
        if (arg2) {
            this.internal.push(`${this.makeArrayAccessor(table, key)}/${arg1}`, arg2);
        } else {
            this.internal.push(this.makeArrayAccessor(table, key), arg1);
        }
    }
}

export const storage = new JsonDatabase();
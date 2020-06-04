import { JsonDB, FindCallback } from "node-json-db";

class Database {
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
        this.ensureArrayExists('tournament');
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
     * Inserts in database and returns the id.
     * @param table Where to insert.
     * @param value What to insert.
     */
    public insert(table: string, value: any): number {
        const id = this.internal.getData(this.makePath(table)).length;
        this.internal.push(this.makeArrayPath(table), { id, ...value });
        return id;
    }

    /**
     * Gets data from a table in the database.
     * @param table Where to get from.
     * @param key What to get.
     */
    public select(table: string, key: number): any;

    /**
     * Gets data from a table in the database.
     * @param table Where to get from.
     * @param pred A predicate to filter data.
     */
    public select(table: string, pred: FindCallback): any[];

    public select(table: string, arg: any): any {
        if (typeof arg === "number")
            return this.internal.getData(this.makeArrayAccessor(table, arg));

        return this.internal.filter(this.makePath(table), arg);
    }

    /**
     * Checks if an id is in an array of element with id property.
     * @param id The id to find.
     * @param array Elements to search in.
     */
    public isIn(id: number, array: { id: number }[]): boolean {
        return array.find(element => element.id === id) !== undefined;
    }

    public all(table: string): any[] {
        return this.internal.getData(this.makePath(table));
    }

    public update(table: string, key: number, property: string, value: any) {
        this.internal.push(`${this.makeArrayAccessor(table, key)}/${property}`, value, false);
    }
}

export const db = new Database();
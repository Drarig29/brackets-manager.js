import { JsonDB } from "node-json-db";

class Database {
    private internal: JsonDB;

    constructor() {
        this.internal = new JsonDB('db.json', true, true);
        this.init()
    }

    private ensureArrayExists(key: string) {
        key = this.makeKey(key);

        if (!this.internal.exists(key))
            this.internal.push(key, []);
    }

    private init() {
        this.ensureArrayExists('tournament');
        this.ensureArrayExists('stage');
        this.ensureArrayExists('group');
        this.ensureArrayExists('round');
        this.ensureArrayExists('match');
        this.ensureArrayExists('match_game');
    }

    private makeKey(key: string): string {
        return `/${key}`;
    }

    private makeArrayKey(key: string): string {
        return `/${key}[]`;
    }

    public reset(): void {
        this.internal.resetData({});
        this.init();
    }

    /**
     * Insert in database and returns the id.
     * @param key Where to insert.
     * @param value What to insert.
     */
    public insert(key: string, value: any): number {
        const id = this.internal.getData(this.makeKey(key)).length;
        this.internal.push(this.makeArrayKey(key), { id, ...value });
        return id;
    }
}

export const db = new Database();
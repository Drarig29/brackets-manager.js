import { Group, Match, MatchGame, Participant, Round, Stage } from "brackets-model";
import { Table } from "../types";

interface Data {
    participant: Participant[];
    stage: Stage[];
    group: Group[];
    round: Round[];
    match: Match[];
    match_game: MatchGame[];
}

type StringIndexedObject = {
    [key: string]: unknown;
};

type Filter<T> = (obj: T) => boolean;

export class InMemoryDatabase {
    data: Data

    constructor() {
        this.data = {
            participant: [],
            stage: [],
            group: [],
            round: [],
            match: [],
            match_game: []
        };
    }

    setData(data: Data) {
        this.data = data;
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

    reset() {
        this.data = {
            participant: [],
            stage: [],
            group: [],
            round: [],
            match: [],
            match_game: []
        };
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
        let id = this.data[table].length;

        if (!Array.isArray(arg)) {
            try {
                this.data[table].push({ id, ...arg });
            }
            catch (error) {
                return -1;
            }
            return id;
        }

        try {
            arg.map(object => {
                this.data[table].push({ id: id++, ...object });
            });
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
     * @param key What to get.
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
            if (arg === undefined) return this.data[table];
            if (typeof arg === "number") return this.data[table][arg];
            return this.data[table].filter(this.makeFilter(arg)) || null;
        }
        catch (error) {
            return null;
        }
    }

    /**
     * Updates data in a table.
     *
     * @param table Where to update.
     * @param key What to update.
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
                this.data[table][arg] = value;
                return true;
            }
            catch (error) {
                return false;
            }
        }

        const values = this.data[table].filter(this.makeFilter(arg));
        if (!values) return false;

        values.forEach(v => {
            let existing = this.data[table][v.id];
            for (const key in value) {
                existing[key] = value[key];
            }
            this.data[table][v.id] = existing;
        });

        return true;
    }

    async delete(table, filter) {
        const values = this.data[table];
        if (!values) return false;
        const predicate = this.makeFilter(filter);
        const negativeFilter = (value) => !predicate(value);
        this.data[table] = values.filter(negativeFilter);
        return true;
    }
}

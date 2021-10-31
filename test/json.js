// TODO: update this with clean JS code

/* eslint-disable */
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.JsonDatabase = void 0;
const node_json_db_1 = require('node-json-db');
//disable 
const clone = require('rfdc')();
class JsonDatabase {
    /**
     * Creates an instance of JsonDatabase, an implementation of CrudInterface for a json file.
     *
     * @param filename An optional filename for the database.
     */
    constructor(filename) {
        this.internal = new node_json_db_1.JsonDB(filename || 'db.json', true, true);
        this.init();
    }
    /**
     * Creates the array if it doesn't exist.
     *
     * @param table The table to check.
     */
    ensureArrayExists(table) {
        const path = JsonDatabase.makePath(table);
        if (!this.internal.exists(path))
            this.internal.push(path, []);
    }
    /**
     * Initiates the storage.
     */
    init() {
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
    static makePath(table) {
        return `/${table}`;
    }
    /**
     * Creates the path of an array.
     *
     * @param table Name of the table.
     */
    static makeArrayPath(table) {
        return `/${table}[]`;
    }
    /**
     * Creates the path of an element at a given index in an array.
     *
     * @param table Name of the table.
     * @param index Index of the element.
     */
    static makeArrayIndexPath(table, index) {
        return `/${table}[${index}]`;
    }
    /**
     * Makes the filter function associated to the partial object.
     *
     * @param partial A partial object with given values as query.
     */
    makeFilter(partial) {
        return (obj) => {
            let result = true;
            for (const [key, value] of Object.entries(partial))
                result = result && obj[key] === value;
            return result;
        };
    }
    /**
     * Empties the database and `init()` it back.
     */
    reset() {
        this.internal.resetData({});
        this.init();
    }
    /**
     * Inserts a unique value or multiple values in a table.
     *
     * @param table Name of the table.
     * @param arg A single value or an array of values.
     */
    async insert(table, arg) {
        const existing = this.internal.getData(JsonDatabase.makePath(table));
        let id = Math.max(-1, ...existing.map(element => element.id)) + 1;
        if (!Array.isArray(arg)) {
            try {
                this.internal.push(JsonDatabase.makeArrayPath(table), { id, ...arg });
            } catch (error) {
                return -1;
            }
            return id;
        }
        try {
            this.internal.push(JsonDatabase.makePath(table), arg.map(object => ({ id: id++, ...object })), false);
        } catch (error) {
            return false;
        }
        return true;
    }
    /**
     * Gets a unique elements, elements matching a filter or all the elements in a table.
     *
     * @param table Name of the table.
     * @param arg An index or a filter.
     */
    async select(table, arg) {
        try {
            if (arg === undefined)
                return this.internal.getData(JsonDatabase.makePath(table)).map(clone);
            if (typeof arg === 'number') {
                const index = this.internal.getIndex(JsonDatabase.makePath(table), arg);
                return clone(this.internal.getData(JsonDatabase.makeArrayIndexPath(table, index)));
            }
            const values = this.internal.filter(JsonDatabase.makePath(table), this.makeFilter(arg)) || null;
            return values && values.map(clone);
        } catch (error) {
            return null;
        }
    }
    /**
     * Updates one or multiple elements in a table.
     *
     * @param table Name of the table.
     * @param arg An index or a filter.
     * @param value The whole object if arg is an index or the values to change if arg is a filter.
     */
    async update(table, arg, value) {
        if (typeof arg === 'number') {
            try {
                const index = this.internal.getIndex(JsonDatabase.makePath(table), arg);
                this.internal.push(JsonDatabase.makeArrayIndexPath(table, index), value);
                return true;
            } catch (error) {
                return false;
            }
        }
        const values = this.internal.filter(JsonDatabase.makePath(table), this.makeFilter(arg));
        if (!values)
            return false;
        values.forEach(v => this.internal.push(JsonDatabase.makeArrayIndexPath(table, v.id), value, false));
        return true;
    }
    /**
     * Delete data in a table, based on a filter.
     *
     * @param table Where to delete in.
     * @param filter An object to filter data or undefined to empty the table.
     */
    async delete(table, filter) {
        const path = JsonDatabase.makePath(table);
        if (!filter) {
            this.internal.push(path, []);
            return true;
        }
        const values = this.internal.getData(path);
        if (!values)
            return false;
        const predicate = this.makeFilter(filter);
        this.internal.push(path, values.filter(value => !predicate(value)));
        return true;
    }
}
exports.JsonDatabase = JsonDatabase;
//# sourceMappingURL=json.js.map

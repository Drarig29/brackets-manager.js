import { CrudInterface, Database, Storage } from './types';
import { InputStage, Stage } from 'brackets-model';
import { Create } from './create';
import { Get } from './get';
import { Update } from './update';
import { Delete } from './delete';
import { Find } from './find';
import { Reset } from './reset';
import { v4 as uuidv4 } from 'uuid';
import * as helpers from './helpers';

export interface CallableCreate extends Create {
    /**
     * Creates a stage for an existing tournament. The tournament won't be created.
     *
     * @param stage A stage to create.
     * @deprecated Please use `manager.create.stage()` instead.
     */
    (stage: InputStage): Promise<Stage>
}

type CrudMethod = (table: string, ...args: unknown[]) => Promise<unknown>;
type AbstractStorage = Record<string, CrudMethod>;

/**
 * A class to handle tournament management at those levels: `stage`, `group`, `round`, `match` and `match_game`.
 */
export class BracketsManager {

    public verbose = false;
    public storage: Storage;

    public get: Get;
    public update: Update;
    public delete: Delete;
    public find: Find;
    public reset: Reset;
    public create: CallableCreate;

    /**
     * Creates an instance of BracketsManager, which will handle all the stuff from the library.
     *
     * @param storageInterface An implementation of CrudInterface.
     * @param verbose Whether to log CRUD operations.
     */
    constructor(storageInterface: CrudInterface, verbose?: boolean) {
        this.verbose = verbose ?? false;

        this.storage = storageInterface as Storage;
        this.instrumentStorage();

        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
        this.storage.selectFirst = async (table, filter, assertUnique = true) => {
            const results = await this.storage.select(table, filter);
            if (!results || results.length === 0)
                return null;

            if (assertUnique && results.length > 1)
                throw Error(`Selecting ${JSON.stringify(filter)} on table "${table}" must return a unique value.`);

            return results[0] ?? null;
        };

        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
        this.storage.selectLast = async (table, filter, assertUnique = true) => {
            const results = await this.storage.select(table, filter);
            if (!results || results.length === 0) return null;

            if (assertUnique && results.length > 1)
                throw Error(`Selecting ${JSON.stringify(filter)} on table "${table}" must return a unique value.`);

            return results[results.length - 1] ?? null;
        };

        const create = new Create(this.storage);

        const createStageFunction = create.stage.bind(this);
        this.create = Object.assign(createStageFunction, { stage: createStageFunction }) as CallableCreate;

        this.get = new Get(this.storage);
        this.update = new Update(this.storage);
        this.delete = new Delete(this.storage);
        this.find = new Find(this.storage);
        this.reset = new Reset(this.storage);
    }

    /**
     * Imports data in the database.
     *
     * @param data Data to import.
     * @param normalizeIds Enable ID normalization: all IDs (and references to them) are remapped to consecutive IDs starting from 0.
     */
    public async import(data: Database, normalizeIds = false): Promise<void> {
        if (normalizeIds)
            data = helpers.normalizeIds(data);

        if (!await this.storage.delete('participant'))
            throw Error('Could not empty the participant table.');
        if (!await this.storage.insert('participant', data.participant))
            throw Error('Could not import participants.');

        if (!await this.storage.delete('stage'))
            throw Error('Could not empty the stage table.');
        if (!await this.storage.insert('stage', data.stage))
            throw Error('Could not import stages.');

        if (!await this.storage.delete('group'))
            throw Error('Could not empty the group table.');
        if (!await this.storage.insert('group', data.group))
            throw Error('Could not import groups.');

        if (!await this.storage.delete('round'))
            throw Error('Could not empty the round table.');
        if (!await this.storage.insert('round', data.round))
            throw Error('Could not import rounds.');

        if (!await this.storage.delete('match'))
            throw Error('Could not empty the match table.');
        if (!await this.storage.insert('match', data.match))
            throw Error('Could not import matches.');

        if (!await this.storage.delete('match_game'))
            throw Error('Could not empty the match_game table.');
        if (!await this.storage.insert('match_game', data.match_game))
            throw Error('Could not import match games.');
    }

    /**
     * Exports data from the database.
     */
    public async export(): Promise<Database> {
        const participants = await this.storage.select('participant');
        if (!participants) throw Error('Error getting participants.');

        const stages = await this.storage.select('stage');
        if (!stages) throw Error('Error getting stages.');

        const groups = await this.storage.select('group');
        if (!groups) throw Error('Error getting groups.');

        const rounds = await this.storage.select('round');
        if (!rounds) throw Error('Error getting rounds.');

        const matches = await this.storage.select('match');
        if (!matches) throw Error('Error getting matches.');

        const matchGames = await this.get.matchGames(matches);

        return {
            participant: participants,
            stage: stages,
            group: groups,
            round: rounds,
            match: matches,
            match_game: matchGames,
        };
    }

    /**
     * Add `console.log()` to storage methods in verbose mode.
     */
    private instrumentStorage(): void {
        const storage = this.storage as unknown as AbstractStorage;
        const instrumentedMethods: Array<keyof CrudInterface> = ['insert', 'select', 'update', 'delete'];

        for (const method of Object.getOwnPropertyNames(Object.getPrototypeOf(storage))) {
            if (!(instrumentedMethods as string[]).includes(method))
                continue;

            const originalMethod = storage[method].bind(storage);

            storage[method] = async (table: string, ...args: unknown[]): Promise<unknown> => {
                const verbose = this.verbose;
                let id: string;
                let start: number;

                if (verbose) {
                    id = uuidv4();
                    start = Date.now();
                    console.log(`${id} ${method.toUpperCase()} "${table}" args: ${JSON.stringify(args)}`);
                }

                const result = await originalMethod(table, ...args);

                if (verbose) {
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
                    const duration = Date.now() - start!;

                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
                    console.log(`${id!} ${duration}ms - Returned ${JSON.stringify(result)}`);
                }

                return result;
            };
        }
    }
}

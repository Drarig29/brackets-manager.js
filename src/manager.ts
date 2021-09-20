import { CrudInterface, Database, DataTypes, Storage, Table } from './types';
import { InputStage } from 'brackets-model';
import { create } from './create';
import { Get } from './get';
import { Update } from './update';
import { Delete } from './delete';
import { Find } from './find';
import { Reset } from './reset';
import * as helpers from './helpers';

/**
 * A class to handle tournament management at those levels: `stage`, `group`, `round`, `match` and `match_game`.
 */
export class BracketsManager {

    public storage: Storage;

    public get: Get;
    public update: Update;
    public delete: Delete;
    public find: Find;
    public reset: Reset;

    /**
     * Creates an instance of BracketsManager, which will handle all the stuff from the library.
     *
     * @param storageInterface An implementation of CrudInterface.
     */
    constructor(storageInterface: CrudInterface) {
        const storage = storageInterface as Storage;

        storage.selectFirst = async <T extends Table>(table: T, filter: Partial<DataTypes[T]>): Promise<DataTypes[T] | null> => {
            const results = await this.storage.select<T>(table, filter);
            if (!results || results.length === 0) return null;
            return results[0];
        };

        storage.selectLast = async <T extends Table>(table: T, filter: Partial<DataTypes[T]>): Promise<DataTypes[T] | null> => {
            const results = await this.storage.select<T>(table, filter);
            if (!results || results.length === 0) return null;
            return results[results.length - 1];
        };

        this.storage = storage;
        this.get = new Get(this.storage);
        this.update = new Update(this.storage);
        this.delete = new Delete(this.storage);
        this.find = new Find(this.storage);
        this.reset = new Reset(this.storage);
    }

    /**
     * Creates a stage for an existing tournament. The tournament won't be created.
     *
     * @param stage A stage to create.
     */
    public async create(stage: InputStage): Promise<void> {
        await create.call(this, stage);
    }

    /**
     * Imports data in the database.
     *
     * @param data Data to import.
     */
    public async import(data: Database): Promise<void> {
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
}

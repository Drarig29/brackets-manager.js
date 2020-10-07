import { InputStage } from 'brackets-model';
import { CrudInterface, IStorage, Table } from './storage';
import { create } from './create';
import { Update } from './update';
import { Get } from './get';

/**
 * A class to handle tournament management at those levels: `stage`, `group`, `round`, `match` and `match_game`.
 */
export class BracketsManager {

    protected storage: IStorage;
    public update: Update;
    public get: Get;

    /**
     * Creates an instance of BracketsManager, which will handle all the stuff from the library.
     *
     * @param storageInterface An implementation of CrudInterface.
     */
    constructor(storageInterface: CrudInterface) {
        const storage = (storageInterface as IStorage);

        storage.selectFirst = async <T>(table: Table, filter: Partial<T>) => {
            const results = await this.storage.select<T>(table, filter);
            if (!results || results.length === 0) return null;
            return results[0];
        }

        storage.selectLast = async <T>(table: Table, filter: Partial<T>) => {
            const results = await this.storage.select<T>(table, filter);
            if (!results || results.length === 0) return null;
            return results[results.length - 1];
        }

        this.storage = storage;
        this.create = create;
        this.update = new Update(this.storage);
        this.get = new Get(this.storage);
    }

    /** 
     * Creates a stage for an existing tournament. The tournament won't be created.
     */
    public create: (stage: InputStage) => Promise<void>;
}
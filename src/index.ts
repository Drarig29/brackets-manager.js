import { InputStage } from 'brackets-model';
import { Update } from './update';
import { IStorage } from './storage';
import { create } from './create';

/**
 * A class to handle tournament management at those levels: `stage`, `group`, `round`, `match` and `match_game`.
 */
export class BracketsManager {

    protected storage: IStorage;
    public update: Update;

    constructor(storage: IStorage) {
        this.storage = storage;
        this.update = new Update(storage);
        this.create = create;
    }

    /** 
     * Creates a stage for an existing tournament. The tournament won't be created.
     */
    public create: (tournamentdId: number, stage: InputStage) => Promise<void>;
}

declare global {
    type OmitId<T> = Omit<T, 'id'>
}
import { InputStage } from 'brackets-model';
import { Update } from './update';
import { IStorage } from './storage';
import { create } from './create';
import { ranking } from './results';

export class BracketsManager {

    protected storage: IStorage;
    public update: Update;

    constructor(storage: IStorage) {
        this.storage = storage;
        this.update = new Update(storage);
        this.create = create;
        this.ranking = ranking;
    }

    /** 
     * Creates a stage for an existing tournament. The tournament won't be created.
     */
    public create: (tournamentdId: number, stage: InputStage) => Promise<void>;

    /**
     * Returns the ranking for a round-robin group.
     */
    public ranking: (groupId: number) => Promise<string[]>;
}
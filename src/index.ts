import { InputStage, Match } from 'brackets-model';
import { createStage } from './create';
import { updateMatch } from './update';
import { getRanking } from './results';
import { IStorage } from './storage';

export class BracketsManager {

    protected storage: IStorage;

    constructor(storage: IStorage) {
        this.storage = storage;
        this.createStage = createStage;
        this.updateMatch = updateMatch;
        this.getRanking = getRanking;
    }

    public createStage: (stage: InputStage) => Promise<void>;
    public updateMatch: (match: Partial<Match>, updateNext: boolean) => Promise<void>;
    public getRanking: (groupId: number) => Promise<string[]>;
}
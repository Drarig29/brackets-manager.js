import { InputStage, Match } from 'brackets-model';
import { createStage } from './create';
import { updateMatch } from './update';
import { getRanking } from './results';
import { IStorage } from './storage';

export class BracketsManager {
    storage: IStorage;
    createStage: (stage: InputStage) => void;
    updateMatch: (match: Partial<Match>, updateNext: boolean) => void;
    getRanking: (groupId: number) => string[];

    constructor(storage: IStorage) {
        this.storage = storage;
        this.createStage = createStage;
        this.updateMatch = updateMatch;
        this.getRanking = getRanking;
    }
}
import { InputStage, Match, Round } from 'brackets-model';
import { createStage } from './create';
import { updateMatch, updateRound } from './update';
import { getRanking } from './results';
import { IStorage } from './storage';

export class BracketsManager {

    protected storage: IStorage;

    constructor(storage: IStorage) {
        this.storage = storage;
        this.createStage = createStage;
        this.updateMatch = updateMatch;
        this.updateRound = updateRound;
        this.getRanking = getRanking;
    }

    /** 
     * Creates a stage for an existing tournament. The tournament won't be created.
     */
    public createStage: (tournamentdId: number, stage: InputStage) => Promise<void>;

    /**
     * Updates a match's values.
     */
    public updateMatch: (values: Partial<Match>) => Promise<void>;

    /**
     * Updates a round's values.
     */
    public updateRound: (id: number, matchesChildCount: number) => Promise<void>;

    /**
     * Returns the ranking for a round-robin group.
     */
    public getRanking: (groupId: number) => Promise<string[]>;
}
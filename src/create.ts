import { InputStage, Stage } from 'brackets-model';
import { StageCreator } from './base/stage/creator';
import { Storage } from './types';


export class Create {

    private storage: Storage;

    /**
     * Creates an instance of Create.
     *
     * @param storage The implementation of Storage.
     */
    constructor(storage: Storage) {
        this.storage = storage;
    }

    /**
     * Creates a stage for an existing tournament. The tournament won't be created.
     *
     * @param data The stage to create.
     */
    public async stage(data: InputStage): Promise<Stage> {
        const creator = new StageCreator(this.storage, data);
        return creator.run();
    }
}

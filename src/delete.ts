import { Group, Match, MatchGame, Round, Stage } from 'brackets-model';
import { Storage } from './types';

export class Delete {

    private readonly storage: Storage;

    /**
     * Creates an instance of Delete, which will handle cleanly deleting data in the storage.
     *
     * @param storage The implementation of Storage.
     */
    constructor(storage: Storage) {
        this.storage = storage;
    }

    /**
     * Deletes a stage.
     *
     * @param stageId ID of the stage.
     */
    public async stage(stageId: number): Promise<void> {
        // The order is important because the abstract storage possibly has foreign checks.

        if (!await this.storage.delete<MatchGame>('match_game', { stage_id: stageId }))
            throw Error('Could not delete match games.');

        if (!await this.storage.delete<Match>('match', { stage_id: stageId }))
            throw Error('Could not delete matches.');

        if (!await this.storage.delete<Round>('round', { stage_id: stageId }))
            throw Error('Could not delete rounds.');

        if (!await this.storage.delete<Group>('group', { stage_id: stageId }))
            throw Error('Could not delete groups.');

        if (!await this.storage.delete<Stage>('stage', { id: stageId }))
            throw Error('Could not delete stages.');
    }
}

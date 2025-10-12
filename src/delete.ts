import { Id } from 'brackets-model';
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
     * Deletes a stage, and all its components:
     * 
     * - Groups
     * - Rounds
     * - Matches
     * - Match games
     * 
     * This does not delete the related participants.
     *
     * @param stageId ID of the stage.
     */
    public async stage(stageId: Id): Promise<void> {
        // The order is important here, because the abstract storage can possibly have foreign key checks (e.g. SQL).

        if (!await this.storage.delete('match_game', { stage_id: stageId }))
            throw Error('Could not delete match games.');

        if (!await this.storage.delete('match', { stage_id: stageId }))
            throw Error('Could not delete matches.');

        if (!await this.storage.delete('round', { stage_id: stageId }))
            throw Error('Could not delete rounds.');

        if (!await this.storage.delete('group', { stage_id: stageId }))
            throw Error('Could not delete groups.');

        if (!await this.storage.delete('stage', { id: stageId }))
            throw Error('Could not delete the stage.');
    }

    /**
     * Deletes **the stages** of a tournament (and all their components, see {@link stage | delete.stage()}).
     * 
     * This does not delete the related participants and you are responsible for deleting the tournament itself.
     * 
     * @param tournamentId ID of the tournament.
     */
    public async tournament(tournamentId: Id): Promise<void> {
        const stages = await this.storage.select('stage', { tournament_id: tournamentId });
        if (!stages)
            throw Error('Error getting the stages.');

        // Not doing this in a `Promise.all()` since this can be a heavy operation.
        for (const stage of stages)
            await this.stage(stage.id);
    }
}

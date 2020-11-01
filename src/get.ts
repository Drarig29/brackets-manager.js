import { Group, Match, MatchGame, Participant, Round, Stage } from 'brackets-model';
import { IStorage } from './storage';
import * as helpers from './helpers';

interface StageData {
    stage: Stage,
    groups: Group[],
    rounds: Round[],
    matches: Match[],
    participants: Participant[],
}

export class Get {

    private storage: IStorage;

    /**
     * Creates an instance of Get, which will handle retrieving information from the stage.
     *
     * @param storage The implementation of IStorage.
     */
    constructor(storage: IStorage) {
        this.storage = storage;
    }

    /**
     * Returns the data needed to display a stage.
     *
     * @param stageId ID of the stage.
     * 
     * For performance reasons, match games are not retrieved here. Use `matchChildren()` for that.
     */
    public async stageData(stageId: number): Promise<StageData> {
        const stage = await this.storage.select<Stage>('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        const groups = await this.storage.select<Group>('group', { stage_id: stageId });
        if (!groups) throw Error('Error getting groups.');

        const rounds = await this.storage.select<Round>('round', { stage_id: stageId });
        if (!rounds) throw Error('Error getting rounds.');

        const matches = await this.storage.select<Match>('match', { stage_id: stageId });
        if (!matches) throw Error('Error getting matches.');

        const participants = await this.storage.select<Participant>('participant', { tournament_id: stage.tournament_id });
        if (!participants) throw Error('Error getting participants.');

        return { stage, groups, rounds, matches, participants };
    }

    /**
     * Returns the match games of a match.
     *
     * @param parentId ID of the parent match.
     */
    public async matchChildren(parentId: number): Promise<MatchGame[]> {
        const games = await this.storage.select<MatchGame>('match_game', { parent_id: parentId });
        if (!games) throw Error('Error getting match games (children).');

        return games;
    }

    /**
     * Returns the seeding of a stage.
     *
     * @param stageId ID of the stage.
     */
    public async seeding(stageId: number): Promise<ParticipantSlot[]> {
        const stage = await this.storage.select<Stage>('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        if (stage.type === 'round_robin')
            return this.roundRobinSeeding(stageId);

        return this.eliminationSeeding(stageId);
    }

    /**
     * Returns the seeding of a round-robin stage.
     *
     * @param stageId ID of the stage.
     */
    private async roundRobinSeeding(stageId: number): Promise<ParticipantSlot[]> {
        const matches = await this.storage.select<Match>('match', { stage_id: stageId });
        if (!matches) throw Error('Error getting matches.');

        const slots = helpers.matchesToSeeding(matches);
        const seeding = helpers.uniqueBy(slots, item => item && item.position);

        return seeding;
    }

    /**
     * Returns the seeding of an elimination stage.
     *
     * @param stageId ID of the stage.
     */
    private async eliminationSeeding(stageId: number): Promise<ParticipantSlot[]> {
        const round = await this.storage.selectFirst<Round>('round', { stage_id: stageId, number: 1 });
        if (!round) throw Error('Error getting the first round.');

        const matches = await this.storage.select<Match>('match', { round_id: round.id });
        if (!matches) throw Error('Error getting matches.');

        return helpers.matchesToSeeding(matches);
    }
}
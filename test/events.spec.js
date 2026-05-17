const assert = require('chai').assert;
const { Status } = require('brackets-model');
const { InMemoryDatabase } = require('brackets-memory-db');
const { BracketsManager } = require('../dist');

const emptyData = {
    participant: [],
    stage: [],
    group: [],
    round: [],
    match: [],
    match_game: [],
};

const stage = {
    id: 0,
    tournament_id: 0,
    name: 'Event stage',
    type: 'round_robin',
    number: 1,
    settings: { size: 2 },
};

const match = {
    id: 0,
    stage_id: 0,
    group_id: 0,
    round_id: 0,
    number: 1,
    child_count: 0,
    status: Status.Ready,
    opponent1: { id: 0 },
    opponent2: { id: 1 },
};

/**
 * Creates a manager backed by in-memory test data.
 *
 * @param data Data to put in storage.
 */
function makeManager(data = {}) {
    const storage = new InMemoryDatabase();
    storage.setData({
        ...emptyData,
        ...data,
    });

    return new BracketsManager(storage);
}

/**
 * Normalizes generated event metadata for stable assertions.
 *
 * @param events Events to normalize.
 */
function normalizeEvents(events) {
    return events.map(({ id, duration, ...event }) => ({
        id: typeof id,
        ...event,
        duration: typeof duration,
    }));
}

describe('Events', () => {
    it('should emit entity.changed when a match update succeeds', async () => {
        const manager = makeManager({ stage: [stage], match: [match] });
        const entityEvents = [];

        manager.on('entity.changed', event => entityEvents.push(event));

        await manager.update.match({
            id: 0,
            opponent1: { score: 1 },
            opponent2: { score: 0 },
        });

        assert.deepEqual(normalizeEvents(entityEvents), [{
            id: 'string',
            method: 'update',
            table: 'match',
            args: [
                0,
                {
                    ...match,
                    status: Status.Running,
                    opponent1: { id: 0, score: 1 },
                    opponent2: { id: 1, score: 0 },
                },
            ],
            result: true,
            duration: 'number',
        }]);
    });

    it('should emit entity.changed for match game and parent match updates', async () => {
        const manager = makeManager({
            stage: [stage],
            match: [{ ...match, child_count: 1 }],
            match_game: [{
                id: 0,
                stage_id: 0,
                parent_id: 0,
                number: 1,
                status: Status.Ready,
                opponent1: { id: 0 },
                opponent2: { id: 1 },
            }],
        });
        const entityEvents = [];

        manager.on('entity.changed', event => entityEvents.push(event));

        await manager.update.matchGame({
            id: 0,
            opponent1: { result: 'win' },
        });

        assert.deepEqual(normalizeEvents(entityEvents), [
            {
                id: 'string',
                method: 'update',
                table: 'match_game',
                args: [
                    0,
                    {
                        id: 0,
                        stage_id: 0,
                        parent_id: 0,
                        number: 1,
                        status: Status.Completed,
                        opponent1: { id: 0, result: 'win' },
                        opponent2: { id: 1, result: 'loss' },
                    },
                ],
                result: true,
                duration: 'number',
            },
            {
                id: 'string',
                method: 'update',
                table: 'match',
                args: [
                    0,
                    {
                        ...match,
                        child_count: 1,
                        status: Status.Completed,
                        opponent1: { id: 0, score: 1, result: 'win' },
                        opponent2: { id: 1, score: 0, result: 'loss' },
                    },
                ],
                result: true,
                duration: 'number',
            },
            {
                id: 'string',
                method: 'update',
                table: 'match_game',
                args: [
                    { parent_id: 0 },
                    {
                        opponent1: { id: 0 },
                        opponent2: { id: 1 },
                    },
                ],
                result: true,
                duration: 'number',
            },
        ]);
    });

    it('should emit when a storage update succeeds without comparing data', async () => {
        const manager = makeManager({ stage: [stage], match: [match] });
        const entityEvents = [];

        manager.on('entity.changed', event => entityEvents.push(event));

        await manager.update.match({ id: 0 });

        assert.deepEqual(normalizeEvents(entityEvents), [{
            id: 'string',
            method: 'update',
            table: 'match',
            args: [0, match],
            result: true,
            duration: 'number',
        }]);
    });

    it('should emit one event for a successful bulk update operation', async () => {
        const manager = makeManager({
            match: [
                { ...match, id: 0 },
                { ...match, id: 1 },
            ],
        });
        const entityEvents = [];

        manager.on('entity.changed', event => entityEvents.push(event));

        await manager.storage.update('match', { stage_id: 0 }, { child_count: 1 });

        assert.deepEqual(normalizeEvents(entityEvents), [{
            id: 'string',
            method: 'update',
            table: 'match',
            args: [{ stage_id: 0 }, { child_count: 1 }],
            result: true,
            duration: 'number',
        }]);
    });

    it('should emit entity.changed when insert and delete operations succeed', async () => {
        const manager = makeManager();
        const entityEvents = [];

        manager.on('entity.changed', event => entityEvents.push(event));

        const id = await manager.storage.insert('participant', { tournament_id: 0, name: 'Team 1' });
        await manager.storage.delete('participant', { id });

        assert.deepEqual(normalizeEvents(entityEvents), [
            {
                id: 'string',
                method: 'insert',
                table: 'participant',
                args: [{ tournament_id: 0, name: 'Team 1' }],
                result: 0,
                duration: 'number',
            },
            {
                id: 'string',
                method: 'delete',
                table: 'participant',
                args: [{ id: 0 }],
                result: true,
                duration: 'number',
            },
        ]);
    });
});

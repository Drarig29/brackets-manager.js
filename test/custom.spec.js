const chai = require('chai');
chai.use(require('chai-as-promised'));

const assert = chai.assert;
const { BracketsManager } = require('../dist');
const { JsonDatabase } = require('brackets-json-db');

const storage = new JsonDatabase();
const manager = new BracketsManager(storage);

const createTournament = (tournamentType) => ({
    name: 'Amateur',
    tournamentId: 0,
    type: tournamentType,
    seeding: [
        { name: 'Team 1', nationality: 'US' },
        { name: 'Team 2', nationality: 'US' },
        { name: 'Team 3', nationality: 'US' },
        { name: 'Team 4', nationality: 'US' },
        { name: 'Team 5', nationality: 'US' },
        { name: 'Team 6', nationality: 'US' },
        { name: 'Team 7', nationality: 'US' },
        { name: 'Team 8', nationality: 'US' },
        { name: 'Team 9', nationality: 'US' },
        { name: 'Team 10', nationality: 'US' },
        { name: 'Team 11', nationality: 'US' },
        { name: 'Team 12', nationality: 'US' },
        { name: 'Team 13', nationality: 'US' },
        { name: 'Team 14', nationality: 'US' },
        { name: 'Team 15', nationality: 'US' },
        { name: 'Team 16', nationality: 'US' },
    ],
    settings:
        tournamentType === 'round_robin'
            ? { groupCount: 2 }
            : { seedOrdering: ['natural'] },
});

describe('Create tournaments with custom seeding', async () => {
    beforeEach(async () => {
        storage.reset();
    });

    it('should create single elimination with custom seeding', async () => {
        await manager.create.stage(createTournament('single_elimination'));
        const stageData = await manager.get.stageData(0);
        assert.strictEqual(stageData.participant[0].nationality, 'US');
        assert.strictEqual(stageData.participant.length, 16);
    });

    it('should create double elimination with custom seeding', async () => {
        await manager.create.stage(createTournament('double_elimination'));
        const stageData = await manager.get.stageData(0);

        assert.strictEqual(stageData.participant[0].nationality, 'US');
        assert.strictEqual(stageData.participant.length, 16);
    });

    it('should create round robin with custom seeding', async () => {
        await manager.create.stage(createTournament('round_robin'));
        const stageData = await manager.get.stageData(0);

        assert.strictEqual(stageData.participant[0].nationality, 'US');
        assert.strictEqual(stageData.participant.length, 16);
    });
});

describe('Update results with extra fields', () => {
    beforeEach(async () => {
        storage.reset();
    });

    it('Extra fields when updating a match', async () => {
        await manager.create.stage({
            name: 'Amateur',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
            ],
        });

        await manager.update.match({
            id: 0,
            weather: 'rainy', // Extra field.
            opponent1: {
                score: 3,
                result: 'win',
            },
            opponent2: {
                score: 1,
                result: 'loss',
            },
        });

        await manager.update.match({
            id: 1,
            opponent1: {
                score: 3,
                result: 'win',
                foo: 42, // Extra field.
            },
            opponent2: {
                score: 1,
                result: 'loss',
            },
        });

        await manager.update.match({
            id: 2,
            opponent1: {
                score: 3,
                result: 'win',
            },
            opponent2: {
                score: 1,
                result: 'loss',
                info: { replacements: [1, 2] }, // Extra field.
            },
        });

        assert.strictEqual((await storage.select('match', 0)).weather, 'rainy');
        assert.strictEqual((await storage.select('match', 1)).opponent1.foo, 42);
        assert.deepStrictEqual((await storage.select('match', 2)).opponent2.info, { replacements: [1, 2] });
    });

    it('Extra fields when updating a match game', async () => {
        await manager.create.stage({
            name: 'Amateur',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2',
            ],
            settings: {
                matchesChildCount: 3,
            },
        });

        await manager.update.matchGame({
            id: 0,
            weather: 'rainy', // Extra field.
            opponent1: {
                score: 3,
                result: 'win',
            },
            opponent2: {
                score: 1,
                result: 'loss',
            },
        });

        await manager.update.matchGame({
            id: 1,
            opponent1: {
                score: 3,
                result: 'win',
                foo: 42, // Extra field.
            },
            opponent2: {
                score: 1,
                result: 'loss',
                info: { replacements: [1, 2] }, // Extra field.
            },
        });

        assert.strictEqual((await storage.select('match_game', 0)).weather, 'rainy');
        assert.strictEqual((await storage.select('match_game', 1)).opponent1.foo, 42);
        assert.deepStrictEqual((await storage.select('match_game', 1)).opponent2.info, { replacements: [1, 2] });
    });
});

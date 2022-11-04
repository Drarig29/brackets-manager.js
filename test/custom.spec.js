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
        await manager.create(createTournament('single_elimination'));
        const stageData = await manager.get.stageData(0);
        assert.strictEqual(stageData.participant[0].nationality, 'US');
        assert.strictEqual(stageData.participant.length, 16);
    });

    it('should create double elimination with custom seeding', async () => {
        await manager.create(createTournament('double_elimination'));
        const stageData = await manager.get.stageData(0);

        assert.strictEqual(stageData.participant[0].nationality, 'US');
        assert.strictEqual(stageData.participant.length, 16);
    });

    it('should create round robin with custom seeding', async () => {
        await manager.create(createTournament('round_robin'));
        const stageData = await manager.get.stageData(0);

        assert.strictEqual(stageData.participant[0].nationality, 'US');
        assert.strictEqual(stageData.participant.length, 16);
    });
});

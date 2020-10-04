const chai = require('chai');
const { sign } = require('crypto');
chai.use(require("chai-as-promised"));

const assert = chai.assert;
const { BracketsManager } = require('../dist');
const { storage } = require('../dist/storage/json');

const manager = new BracketsManager(storage);

const example = {
    name: 'Amateur',
    tournamentId: 0,
    type: 'double_elimination',
    seeding: [
        'Team 1', 'Team 2',
        'Team 3', 'Team 4',
        'Team 5', 'Team 6',
        'Team 7', 'Team 8',
        'Team 9', 'Team 10',
        'Team 11', 'Team 12',
        'Team 13', 'Team 14',
        'Team 15', 'Team 16',
    ],
    settings: { seedOrdering: ['natural'], grandFinal: 'simple' },
};

describe('Create double elimination stage', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should create a double elimination stage', async () => {
        await manager.create(example);

        const stage = await storage.select('stage', 0);
        assert.equal(stage.name, example.name);
        assert.equal(stage.type, example.type);

        assert.equal((await storage.select('group')).length, 3);
        assert.equal((await storage.select('round')).length, 4 + 6 + 1);
        assert.equal((await storage.select('match')).length, 30);
    });

    it('should create a double elimination stage with only two participants', async () => {
        // This is an edge case. No lower bracket nor grand final will be created.
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            settings: { size: 2 },
        });

        assert.equal((await storage.select('group')).length, 1);
        assert.equal((await storage.select('round')).length, 1);
        assert.equal((await storage.select('match')).length, 1);

        // Ensure update works.
        await manager.update.seeding(0, ['Team 1', 'Team 2']);
        await manager.update.match({
            id: 0,
            opponent1: { result: 'win' },
        });
    });

    it('should create a tournament with a double grand final', async () => {
        await manager.create({
            name: 'Example with double grand final',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: { grandFinal: 'double', seedOrdering: ['natural'] },
        });

        assert.equal((await storage.select('group')).length, 3);
        assert.equal((await storage.select('round')).length, 3 + 4 + 2);
        assert.equal((await storage.select('match')).length, 15);
    });
});

describe('Winner bracket', () => {

    before(async () => {
        storage.reset();
        await manager.create(example);
    });

    it('should end a match and determine next matches', async () => {
        const before = await storage.select('match', 8); // First match of WB round 2
        assert.equal(before.opponent2.id, null);

        await manager.update.match({
            id: 0, // First match of WB round 1
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 12 },
        });

        await manager.update.match({
            id: 1, // Second match of WB round 1
            opponent1: { score: 13 },
            opponent2: { score: 16, result: 'win' },
        });

        await manager.update.match({
            id: 15, // First match of LB round 1
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 10 },
        });

        assert.equal(
            (await storage.select('match', 8)).opponent1.id, // Determined opponent for WB round 2
            (await storage.select('match', 0)).opponent1.id, // Winner of first match round 1
        );

        assert.equal(
            (await storage.select('match', 8)).opponent2.id, // Determined opponent for WB round 2
            (await storage.select('match', 1)).opponent2.id, // Winner of second match round 1
        );

        assert.equal(
            (await storage.select('match', 15)).opponent2.id, // Determined opponent for LB round 1
            (await storage.select('match', 1)).opponent1.id, // Loser of second match round 1
        );

        assert.equal(
            (await storage.select('match', 19)).opponent1.id, // Determined opponent for LB round 2
            (await storage.select('match', 0)).opponent2.id, // Loser of second match round 1
        );
    });
});
const { Status } = require('brackets-model');
const chai = require('chai');
chai.use(require("chai-as-promised"));

const assert = chai.assert;
const { BracketsManager } = require('../dist');
const { storage } = require('../dist/storage/json');

const manager = new BracketsManager(storage);

describe('Create double elimination stage', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should create a double elimination stage', async () => {
        await manager.create({
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
        });

        const stage = await storage.select('stage', 0);
        assert.equal(stage.name, 'Amateur');
        assert.equal(stage.type, 'double_elimination');

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

describe('Previous and next match update in double elimination stage', () => {
    beforeEach(() => {
        storage.reset();
    });

    it('should end a match and determine next matches', async () => {
        await manager.create({
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
        });

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
            (await storage.select('match', 19)).opponent2.id, // Determined opponent for LB round 2
            (await storage.select('match', 0)).opponent2.id, // Loser of second match round 1
        );
    });

    it('should determine matches in grand final', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: { grandFinal: 'double' },
        });

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
            id: 2, // WB Final
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 9 },
        });

        assert.equal(
            (await storage.select('match', 5)).opponent1.id, // Determined opponent for the grand final (round 1)
            (await storage.select('match', 0)).opponent1.id, // Winner of WB Final
        );

        await manager.update.match({
            id: 3, // Only match of LB round 1
            opponent1: { score: 12, result: 'win' }, // Team 4
            opponent2: { score: 8 },
        });

        await manager.update.match({
            id: 4, // LB Final
            opponent1: { score: 14, result: 'win' }, // Team 3
            opponent2: { score: 7 },
        });

        assert.equal(
            (await storage.select('match', 5)).opponent2.id, // Determined opponent for the grand final (round 1)
            (await storage.select('match', 1)).opponent2.id, // Winner of LB Final
        );

        await manager.update.match({
            id: 5, // Grand Final round 1
            opponent1: { score: 10 },
            opponent2: { score: 16, result: 'win' }, // Team 3
        });

        assert.equal(
            (await storage.select('match', 6)).opponent2.id, // Determined opponent for the grand final (round 2)
            (await storage.select('match', 1)).opponent2.id, // Winner of LB Final
        );
    });

    it('should determine next matches and reset them', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: { grandFinal: 'double' },
        });

        await manager.update.match({
            id: 0, // First match of WB round 1
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 12 },
        });

        const beforeReset = await storage.select('match', 3); // Determined opponent for LB round 1
        assert.equal(beforeReset.opponent1.id, (await storage.select('match', 0)).opponent2.id);
        assert.equal(beforeReset.opponent1.position, 1); // Must be set.

        await manager.update.match({
            id: 0, // First match of WB round 1
            opponent1: { result: undefined },
        });

        const afterReset = await storage.select('match', 3); // Determined opponent for LB round 1
        assert.equal(afterReset.opponent1.id, null);
        assert.equal(afterReset.opponent1.position, 1); // It must stay.
    });

    it('should archive previous matches', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: { grandFinal: 'double' },
        });

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
            id: 2, // WB Final
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 9 },
        });

        // WB Final archived both WB round 1 matches
        assert.equal((await storage.select('match', 0)).status, Status.Archived);
        assert.equal((await storage.select('match', 1)).status, Status.Archived);

        // Reset the result
        await manager.update.match({
            id: 2, // WB Final
            opponent1: { result: undefined },
        });

        // Should remove the archived status
        assert.equal((await storage.select('match', 0)).status, Status.Completed);
        assert.equal((await storage.select('match', 1)).status, Status.Completed);

        await manager.update.match({
            id: 3, // Only match of LB round 1
            opponent1: { score: 12, result: 'win' }, // Team 4
            opponent2: { score: 8 },
        });

        // First round of LB archived both WB round 1 matches
        assert.equal((await storage.select('match', 0)).status, Status.Archived);
        assert.equal((await storage.select('match', 1)).status, Status.Archived);

        await manager.update.match({
            id: 2, // WB Final
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 9 },
        });

        await manager.update.match({
            id: 4, // LB Final
            opponent1: { score: 14, result: 'win' }, // Team 3
            opponent2: { score: 7 },
        });

        assert.equal((await storage.select('match', 2)).status, Status.Archived);
        assert.equal((await storage.select('match', 3)).status, Status.Archived);

        // Force status of WB Final to completed to make sure the Grand Final sets it to Archived.
        await storage.update('match', 2, {
            ...await storage.select('match', 2),
            status: Status.Completed,
        });

        await manager.update.match({
            id: 5, // Grand Final round 1
            opponent1: { score: 10 },
            opponent2: { score: 16, result: 'win' }, // Team 3
        });

        assert.equal((await storage.select('match', 2)).status, Status.Archived);

        await manager.update.match({
            id: 6, // Grand Final round 2
            opponent1: { score: 10 },
            opponent2: { score: 16, result: 'win' }, // Team 3
        });

        assert.equal((await storage.select('match', 5)).status, Status.Archived);
    });
});

describe('Skip first round', () => {
    beforeEach(async () => {
        storage.reset();

        await manager.create({
            name: 'Example with double grand final',
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
            settings: {
                seedOrdering: ['natural'],
                skipFirstRound: true,
            },
        });
    });

    it('should create a double elimination stage with skip first round option', async () => {
        assert.equal((await storage.select('group')).length, 2);
        assert.equal((await storage.select('round')).length, 3 + 6); // One round less in WB.
        assert.equal((await storage.select('match')).length, (4 + 2 + 1) + (4 + 4 + 2 + 2 + 1 + 1));

        assert.equal((await storage.select('round', 0)).number, 1); // Even though the "real" first round is skipped, the stored first round's number should be 1.

        assert.equal((await storage.select('match', 0)).opponent1.id, 0); // First match of WB.
        assert.equal((await storage.select('match', 7)).opponent1.id, 1); // First match of LB.
    });
});
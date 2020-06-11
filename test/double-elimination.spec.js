const chai = require('chai');
chai.use(require("chai-as-promised"));

const assert = chai.assert;
const { BracketsManager } = require('../dist');
const { storage } = require('../dist/storage/json');

const manager = new BracketsManager(storage);

const example = {
    name: 'Amateur',
    type: 'double_elimination',
    participants: [
        'Team 1', 'Team 2',
        'Team 3', 'Team 4',
        'Team 5', 'Team 6',
        'Team 7', 'Team 8',
        'Team 9', 'Team 10',
        'Team 11', 'Team 12',
        'Team 13', 'Team 14',
        'Team 15', 'Team 16',
    ],
    settings: { seedOrdering: ['natural'] },
};

describe('Create double elimination stage', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should create a double elimination stage', async () => {
        await manager.createStage(example);

        const stage = await storage.select('stage', 0);
        assert.equal(stage.name, example.name);
        assert.equal(stage.type, example.type);

        assert.equal((await storage.select('group')).length, 3);
        assert.equal((await storage.select('round')).length, 4 + 6 + 1);
        assert.equal((await storage.select('match')).length, 30);
    });

    it('should propagate BYEs through the brackets', async () => {
        const withByes = {
            name: 'Example with BYEs',
            type: 'double_elimination',
            participants: [
                'Team 1', null,
                null, null,
            ],
            settings: { seedOrdering: ['natural'] },
        };

        await manager.createStage(withByes);

        assert.equal((await storage.select('match', 2)).opponent1.id, 0);
        assert.equal((await storage.select('match', 2)).opponent2, null);

        assert.equal((await storage.select('match', 3)).opponent1, null);
        assert.equal((await storage.select('match', 3)).opponent2, null);

        assert.equal((await storage.select('match', 4)).opponent1, null);
        assert.equal((await storage.select('match', 4)).opponent2, null);

        assert.equal((await storage.select('match', 5)).opponent1.id, 0);
        assert.equal((await storage.select('match', 5)).opponent2, null);
    });

    it('should create a tournament with a double grand final', async () => {
        const withDoubleGrandFinal = {
            name: 'Example with double grand final',
            type: 'double_elimination',
            participants: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: { grandFinal: 'double', seedOrdering: ['natural'] },
        };

        await manager.createStage(withDoubleGrandFinal);

        const stage = await storage.select('stage', 0);
        assert.equal(stage.name, withDoubleGrandFinal.name);
        assert.equal(stage.type, withDoubleGrandFinal.type);

        assert.equal((await storage.select('group')).length, 3);
        assert.equal((await storage.select('round')).length, 3 + 4 + 2);
        assert.equal((await storage.select('match')).length, 15);
    });
});

describe('Update matches', () => {

    before(async () => {
        storage.reset();
        await manager.createStage(example);
    });

    it('should start a match', async () => {
        const before = await storage.select('match', 0);
        assert.equal(before.status, 'pending');

        await manager.updateMatch({
            id: 0,
            status: 'running',
        });

        const after = await storage.select('match', 0);
        assert.equal(after.status, 'running');
    });

    it('should update the scores for a match', async () => {
        const before = await storage.select('match', 0);
        assert.equal(before.opponent1.score, undefined);

        await manager.updateMatch({
            id: 0,
            opponent1: { score: 2 },
            opponent2: { score: 1 },
        });

        const after = await storage.select('match', 0);
        assert.equal(after.opponent1.score, 2);

        // Name should stay. It shouldn't be overwritten.
        assert.equal(after.opponent1.id, 0);
    });

    it('should simply end the match here', async () => {
        await manager.updateMatch({
            id: 0,
            status: 'running',
        });

        const before = await storage.select('match', 0);
        assert.equal(before.status, 'running');

        // TODO: should test for scores and notify if it's tied.
        // TODO: in a case of a tied match, the admin should be able to set the winner manually or set a forfeit.

        await manager.updateMatch({
            id: 0,
            status: 'completed',
        });

        const after = await storage.select('match', 0);
        assert.equal(after.status, 'completed');
    });

    it('should end the match by only setting the winner', async () => {
        const before = await storage.select('match', 0);
        assert.equal(before.opponent1.result, undefined);

        await manager.updateMatch({
            id: 0,
            opponent1: { result: 'win' },
        });

        const after = await storage.select('match', 0);
        assert.equal(after.status, 'completed');
        assert.equal(after.opponent1.result, 'win');
        assert.equal(after.opponent2.result, 'loss');
    });

    it('should end the match by only setting a forfeit', async () => {
        const before = await storage.select('match', 2);
        assert.equal(before.opponent1.result, undefined);

        await manager.updateMatch({
            id: 2,
            opponent1: { forfeit: true },
        });

        const after = await storage.select('match', 2);
        assert.equal(after.status, 'completed');
        assert.equal(after.opponent1.forfeit, true);
        assert.equal(after.opponent1.result, null);
        assert.equal(after.opponent2.result, 'win');
    });

    it('should end the match by setting winner and loser', async () => {
        await manager.updateMatch({
            id: 0,
            status: 'running',
        });

        await manager.updateMatch({
            id: 0,
            opponent1: { result: 'win' },
            opponent2: { result: 'loss' },
        });

        const after = await storage.select('match', 0);
        assert.equal(after.status, 'completed');
        assert.equal(after.opponent1.result, 'win');
        assert.equal(after.opponent2.result, 'loss');
    });

    it('should end the match by setting the winner and the scores', async () => {
        await manager.updateMatch({
            id: 1,
            opponent1: { score: 6 },
            opponent2: { result: 'win', score: 3 },
        });

        const after = await storage.select('match', 1);
        assert.equal(after.status, 'completed');

        assert.equal(after.opponent1.result, 'loss');
        assert.equal(after.opponent1.score, 6);

        assert.equal(after.opponent2.result, 'win');
        assert.equal(after.opponent2.score, 3);
    });

    it('should fail if two winners', () => {
        assert.isRejected(manager.updateMatch({
            id: 3,
            opponent1: { result: 'win' },
            opponent2: { result: 'win' },
        }));

        assert.isRejected(manager.updateMatch({
            id: 3,
            opponent1: { result: 'loss' },
            opponent2: { result: 'loss' },
        }));
    });
});

describe('Winner bracket', () => {

    before(async () => {
        storage.reset();
        await manager.createStage(example);
    });

    it('should end a match (round 1) and determine one team in next (round 2)', async () => {
        const before = await storage.select('match', 8); // First match of WB round 2
        assert.equal(before.opponent2.id, null);

        await manager.updateMatch({
            id: 1, // Second match of WB round 1
            opponent1: {
                score: 13
            },
            opponent2: {
                score: 16,
                result: 'win',
            },
        }, true);

        assert.equal(
            (await storage.select('match', 8)).opponent2.id, // Determined opponent for round 2
            (await storage.select('match', 1)).opponent2.id, // Winner of round 1
        );
    });
});
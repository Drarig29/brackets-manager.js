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

describe('Update matches', () => {

    before(async () => {
        storage.reset();
        await manager.create(0, example);
    });

    it('should start a match', async () => {
        const before = await storage.select('match', 0);
        assert.equal(before.status, 'pending');

        await manager.update.match({
            id: 0,
            status: 'running',
        });

        const after = await storage.select('match', 0);
        assert.equal(after.status, 'running');
    });

    it('should update the scores for a match and set it to running', async () => {
        const before = await storage.select('match', 0);
        assert.notExists(before.opponent1.score);

        await manager.update.match({
            id: 0,
            opponent1: { score: 2 },
            opponent2: { score: 1 },
        });

        const after = await storage.select('match', 0);
        assert.equal(after.status, 'running');
        assert.equal(after.opponent1.score, 2);

        // Name should stay. It shouldn't be overwritten.
        assert.equal(after.opponent1.id, 0);
    });

    it('should throw if end a match without winner', async () => {
        await assert.isRejected(manager.update.match({
            id: 4,
            status: 'completed',
        }), 'The match is not really completed.');
    })

    it('should end the match by only setting the winner', async () => {
        const before = await storage.select('match', 0);
        assert.notExists(before.opponent1.result);

        await manager.update.match({
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
        assert.notExists(before.opponent1.result);

        await manager.update.match({
            id: 2,
            opponent1: { forfeit: true },
        });

        const after = await storage.select('match', 2);
        assert.equal(after.status, 'completed');
        assert.equal(after.opponent1.forfeit, true);
        assert.equal(after.opponent1.result, null);
        assert.equal(after.opponent2.result, 'win');
    });

    it('should remove forfeit from a match', async () => {
        await manager.update.match({
            id: 2,
            opponent1: { forfeit: undefined },
        });

        const after = await storage.select('match', 2);
        assert.equal(after.status, 'running');
        assert.notExists(after.opponent1.forfeit);
        assert.notExists(after.opponent1.result);
        assert.notExists(after.opponent2.result);
    });

    it('should end the match by setting winner and loser', async () => {
        await manager.update.match({
            id: 0,
            status: 'running',
        });

        await manager.update.match({
            id: 0,
            opponent1: { result: 'win' },
            opponent2: { result: 'loss' },
        });

        const after = await storage.select('match', 0);
        assert.equal(after.status, 'completed');
        assert.equal(after.opponent1.result, 'win');
        assert.equal(after.opponent2.result, 'loss');
    });

    it('should remove results from a match', async () => {
        await manager.update.match({
            id: 0,
            opponent1: { result: undefined },
            opponent1: { result: undefined },
        });

        const after = await storage.select('match', 0);
        assert.equal(after.status, 'running');
        assert.notExists(after.opponent1.result);
        assert.notExists(after.opponent2.result);
    });

    it('should end the match by setting the winner and the scores', async () => {
        await manager.update.match({
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

    it('should throw if two winners', async () => {
        await assert.isRejected(manager.update.match({
            id: 3,
            opponent1: { result: 'win' },
            opponent2: { result: 'win' },
        }));

        await assert.isRejected(manager.update.match({
            id: 3,
            opponent1: { result: 'loss' },
            opponent2: { result: 'loss' },
        }));
    });
});

describe('Locked matches', () => {

    before(async () => {
        storage.reset();
        await manager.create(0, example);
    });

    it('shoud throw when the matches leading to the match have not been completed yet', async () => {
        await assert.isFulfilled(manager.update.match({ id: 0 })); // No problem when no previous match.
        await assert.isRejected(manager.update.match({ id: 8 }), 'The match is locked.'); // First match of WB Round 2.
        await assert.isRejected(manager.update.match({ id: 15 }), 'The match is locked.'); // First match of LB Round 1.
        await assert.isRejected(manager.update.match({ id: 19 }), 'The match is locked.'); // First match of LB Round 1.
        await assert.isRejected(manager.update.match({ id: 23 }), 'The match is locked.'); // First match of LB Round 3.
    });

    it('should throw when one of participants already played next match', async () => {
        // Setup.
        await manager.update.match({ id: 0, opponent1: { result: 'win' } });
        await manager.update.match({ id: 1, opponent1: { result: 'win' } });
        await manager.update.match({ id: 8, opponent1: { result: 'win' } });

        await assert.isRejected(manager.update.match({ id: 0 }), 'The match is locked.');
    });
});
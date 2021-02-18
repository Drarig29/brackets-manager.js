const chai = require('chai');
chai.use(require('chai-as-promised'));

const assert = chai.assert;
const { Status } = require('brackets-model');
const { BracketsManager, JsonDatabase } = require('../dist');

const storage = new JsonDatabase();
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
    settings: { seedOrdering: ['natural'] },
};

describe('Update matches', () => {

    before(async () => {
        storage.reset();
        await manager.create(example);
    });

    it('should start a match', async () => {
        const before = await storage.select('match', 0);
        assert.strictEqual(before.status, Status.Ready);

        await manager.update.match({
            id: 0,
            status: Status.Running,
        });

        const after = await storage.select('match', 0);
        assert.strictEqual(after.status, Status.Running);
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
        assert.strictEqual(after.status, Status.Running);
        assert.strictEqual(after.opponent1.score, 2);

        // Name should stay. It shouldn't be overwritten.
        assert.strictEqual(after.opponent1.id, 0);
    });

    it('should throw if end a match without winner', async () => {
        await assert.isRejected(manager.update.match({
            id: 4,
            status: Status.Completed,
        }), 'The match is not really completed.');
    });

    it('should end the match by only setting the winner', async () => {
        const before = await storage.select('match', 0);
        assert.notExists(before.opponent1.result);

        await manager.update.match({
            id: 0,
            opponent1: { result: 'win' },
        });

        const after = await storage.select('match', 0);
        assert.strictEqual(after.status, Status.Completed);
        assert.strictEqual(after.opponent1.result, 'win');
        assert.strictEqual(after.opponent2.result, 'loss');
    });

    it('should update the status of the next match', async () => {
        await manager.update.resetMatch(0);

        await manager.update.match({
            id: 0,
            opponent1: { result: 'win' },
        });

        assert.strictEqual((await storage.select('match', 8)).status, Status.Waiting);

        await manager.update.match({
            id: 1,
            opponent1: { result: 'win' },
        });

        assert.strictEqual((await storage.select('match', 8)).status, Status.Ready);
    });

    it('should end the match by only setting a forfeit', async () => {
        const before = await storage.select('match', 2);
        assert.notExists(before.opponent1.result);

        await manager.update.match({
            id: 2,
            opponent1: { forfeit: true },
        });

        const after = await storage.select('match', 2);
        assert.strictEqual(after.status, Status.Completed);
        assert.strictEqual(after.opponent1.forfeit, true);
        assert.strictEqual(after.opponent1.result, undefined);
        assert.strictEqual(after.opponent2.result, 'win');
    });

    it('should remove forfeit from a match', async () => {
        await manager.update.match({
            id: 2,
            opponent1: { forfeit: true },
        });

        await manager.update.match({
            id: 2,
            opponent1: { forfeit: undefined },
        });

        const after = await storage.select('match', 2);
        assert.strictEqual(after.status, Status.Running);
        assert.notExists(after.opponent1.forfeit);
        assert.notExists(after.opponent1.result);
        assert.notExists(after.opponent2.result);
    });

    it('should end the match by setting winner and loser', async () => {
        await manager.update.match({
            id: 0,
            status: Status.Running,
        });

        await manager.update.match({
            id: 0,
            opponent1: { result: 'win' },
            opponent2: { result: 'loss' },
        });

        const after = await storage.select('match', 0);
        assert.strictEqual(after.status, Status.Completed);
        assert.strictEqual(after.opponent1.result, 'win');
        assert.strictEqual(after.opponent2.result, 'loss');
    });

    it('should remove results from a match', async () => {
        await manager.update.match({
            id: 0,
            opponent1: { result: 'win' },
            opponent2: { result: 'loss' },
        });

        await manager.update.match({
            id: 0,
            opponent1: { result: undefined },
            opponent2: { result: undefined },
        });

        const after = await storage.select('match', 0);
        assert.strictEqual(after.status, Status.Running);
        assert.notExists(after.opponent1.result);
        assert.notExists(after.opponent2.result);
    });

    it('should set the other score to 0 if only one given', async () => {
        await manager.update.match({
            id: 1,
            opponent1: { score: 1 },
        });

        const after = await storage.select('match', 1);
        assert.strictEqual(after.status, Status.Running);
        assert.strictEqual(after.opponent1.score, 1);
        assert.strictEqual(after.opponent2.score, 0);
    });

    it('should end the match by setting the winner and the scores', async () => {
        await manager.update.match({
            id: 1,
            opponent1: { score: 6 },
            opponent2: { result: 'win', score: 3 },
        });

        const after = await storage.select('match', 1);
        assert.strictEqual(after.status, Status.Completed);

        assert.strictEqual(after.opponent1.result, 'loss');
        assert.strictEqual(after.opponent1.score, 6);

        assert.strictEqual(after.opponent2.result, 'win');
        assert.strictEqual(after.opponent2.score, 3);
    });

    it('should throw if two winners', async () => {
        await assert.isRejected(manager.update.match({
            id: 3,
            opponent1: { result: 'win' },
            opponent2: { result: 'win' },
        }), 'There are two winners.');

        await assert.isRejected(manager.update.match({
            id: 3,
            opponent1: { result: 'loss' },
            opponent2: { result: 'loss' },
        }), 'There are two losers.');
    });
});

describe('Locked matches', () => {

    before(async () => {
        storage.reset();
        await manager.create(example);
    });

    it('should throw when the matches leading to the match have not been completed yet', async () => {
        await assert.isFulfilled(manager.update.match({ id: 0 })); // No problem when no previous match.
        await assert.isRejected(manager.update.match({ id: 8 }), 'The match is locked.'); // First match of WB Round 2.
        await assert.isRejected(manager.update.match({ id: 15 }), 'The match is locked.'); // First match of LB Round 1.
        await assert.isRejected(manager.update.match({ id: 19 }), 'The match is locked.'); // First match of LB Round 1.
        await assert.isRejected(manager.update.match({ id: 23 }), 'The match is locked.'); // First match of LB Round 3.
    });

    it('should throw when one of participants already played next match', async () => {
        await manager.update.match({ id: 0, opponent1: { result: 'win' } });
        await manager.update.match({ id: 1, opponent1: { result: 'win' } });
        await manager.update.match({ id: 8, opponent1: { result: 'win' } });

        await assert.isRejected(manager.update.match({ id: 0 }), 'The match is locked.');
    });
});

describe('Update match games', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should update child games status based on the parent match status', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            settings: {
                seedOrdering: ['natural'],
                size: 4,
            },
        });

        await manager.update.matchChildCount('stage', 0, 2); // Set Bo2 for all the stage.
        assert.strictEqual((await storage.select('match', 0)).status, (await storage.select('match_game', 0)).status);

        await manager.update.seeding(0, ['Team 1', 'Team 2', 'Team 3', 'Team 4']);
        assert.strictEqual((await storage.select('match', 0)).status, (await storage.select('match_game', 0)).status);

        // Semi 1
        await manager.update.matchGame({ parent_id: 0, number: 1, opponent1: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 0, number: 2, opponent1: { result: 'win' } });
        assert.strictEqual((await storage.select('match', 0)).status, Status.Completed);
        assert.strictEqual((await storage.select('match', 0)).opponent1.score, 2);
        assert.strictEqual((await storage.select('match', 0)).opponent2.score, 0);

        let finalMatchStatus = (await storage.select('match', 2)).status;
        assert.strictEqual(finalMatchStatus, Status.Waiting);
        assert.strictEqual(finalMatchStatus, (await storage.select('match_game', 4)).status);

        // Semi 2
        await manager.update.matchGame({ parent_id: 1, number: 1, opponent2: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 1, number: 2, opponent2: { result: 'win' } });

        finalMatchStatus = (await storage.select('match', 2)).status;
        assert.strictEqual(finalMatchStatus, Status.Ready);
        assert.strictEqual(finalMatchStatus, (await storage.select('match_game', 4)).status);

        // Final
        await manager.update.matchGame({ parent_id: 2, number: 1, opponent1: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 2, number: 2, opponent1: { result: 'win' } });

        finalMatchStatus = (await storage.select('match', 2)).status;
        assert.strictEqual(finalMatchStatus, Status.Completed);
        assert.strictEqual(finalMatchStatus, (await storage.select('match_game', 4)).status);

        const semi1Status = (await storage.select('match', 0)).status;
        assert.strictEqual(semi1Status, Status.Archived);
        assert.strictEqual(semi1Status, (await storage.select('match_game', 0)).status);

        const semi2Status = (await storage.select('match', 1)).status;
        assert.strictEqual(semi2Status, Status.Archived);
        assert.strictEqual(semi2Status, (await storage.select('match_game', 2)).status);
    });

    it('should update parent score when match game is updated', async () => {
        await manager.create({
            name: 'With match games',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: {
                matchesChildCount: 3, // Bo3.
            },
        });

        await manager.update.matchGame({ id: 0, opponent1: { result: 'win' } });
        const firstChildCompleted = await storage.select('match', 0);
        assert.strictEqual(firstChildCompleted.status, Status.Running);
        assert.strictEqual(firstChildCompleted.opponent1.score, 1);
        assert.strictEqual(firstChildCompleted.opponent2.score, 0);

        await manager.update.matchGame({ id: 1, opponent1: { result: 'win' } });
        const secondChildCompleted = await storage.select('match', 0);
        assert.strictEqual(secondChildCompleted.status, Status.Completed);
        assert.strictEqual(secondChildCompleted.opponent1.score, 2);
        assert.strictEqual(secondChildCompleted.opponent2.score, 0);

        await manager.update.matchGame({ id: 1, opponent1: { result: undefined } });
        const secondChildReset = await storage.select('match', 0);
        assert.strictEqual(secondChildReset.status, Status.Running);
        assert.strictEqual(secondChildReset.opponent1.score, 1);
        assert.strictEqual(secondChildReset.opponent2.score, 0);
    });

    it('should throw if trying to update a locked match game', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            settings: {
                seedOrdering: ['natural'],
                size: 4,
                matchesChildCount: 3, // Example with all Bo3 at creation time.
            },
        });

        await assert.isRejected(manager.update.matchGame({ id: 0 }), 'The match game is locked.');

        storage.reset();

        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            settings: {
                seedOrdering: ['natural'],
                size: 4,
            },
        });

        await manager.update.matchChildCount('round', 0, 3); // Example with all Bo3 after creation time.
        await assert.isRejected(manager.update.matchGame({ id: 0 }), 'The match game is locked.');
    });

    it('should propagate the winner of the parent match in the next match', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: { seedOrdering: ['natural'] },
        });

        await manager.update.matchChildCount('round', 0, 3);

        await manager.update.matchGame({ id: 0, opponent1: { result: 'win' } });
        await manager.update.matchGame({ id: 1, opponent1: { result: 'win' } });
        await manager.update.matchGame({ id: 2, opponent2: { result: 'win' } });

        assert.strictEqual(
            (await storage.select('match', 2)).opponent1.id, // Should be determined automatically.
            (await storage.select('match', 0)).opponent1.id, // Winner of the first BO3 match.
        );
    });

    it('should select a match game with its parent match id and number', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: {
                matchesChildCount: 3,
            },
        });

        await manager.update.matchGame({
            parent_id: 0,
            number: 1,
            opponent1: { result: 'win' },
        });

        await manager.update.matchGame({
            parent_id: 0,
            number: 2,
            opponent1: { result: 'win' },
        });

        assert.strictEqual((await storage.select('match', 0)).opponent1.score, 2);
    });
});

describe('Seeding', () => {

    beforeEach(async () => {
        storage.reset();

        await manager.create({
            name: 'Without participants',
            tournamentId: 0,
            type: 'double_elimination',
            settings: {
                size: 8,
                seedOrdering: ['natural'],
            },
        });
    });

    it('should update the seeding in a stage without any participant', async () => {
        await manager.update.seeding(0, [
            'Team 1', 'Team 2',
            'Team 3', 'Team 4',
            'Team 5', 'Team 6',
            'Team 7', 'Team 8',
        ]);

        assert.strictEqual((await storage.select('match', 0)).opponent1.id, 0);
        assert.strictEqual((await storage.select('participant')).length, 8);
    });

    it('should reset the seeding of a stage', async () => {
        await manager.update.seeding(0, [
            'Team 1', 'Team 2',
            'Team 3', 'Team 4',
            'Team 5', 'Team 6',
            'Team 7', 'Team 8',
        ]);

        await manager.update.resetSeeding(0);

        assert.strictEqual((await storage.select('match', 0)).opponent1.id, null);
        assert.strictEqual((await storage.select('participant')).length, 8); // Participants aren't removed.
    });

    it('should update the seeding in a stage with participants already', async () => {
        await manager.update.seeding(0, [
            'Team 1', 'Team 2',
            'Team 3', 'Team 4',
            'Team 5', 'Team 6',
            'Team 7', 'Team 8',
        ]);

        await manager.update.seeding(0, [
            'Team A', 'Team B',
            'Team C', 'Team D',
            'Team E', 'Team F',
            'Team G', 'Team H',
        ]);

        assert.strictEqual((await storage.select('match', 0)).opponent1.id, 8);
        assert.strictEqual((await storage.select('participant')).length, 16);
    });

    it('should update the seeding in a stage by registering only one missing participant', async () => {
        await manager.update.seeding(0, [
            'Team A', 'Team B',
            'Team C', 'Team D',
            'Team E', 'Team F',
            'Team G', 'Team H',
        ]);

        await manager.update.seeding(0, [
            'Team A', 'Team B', // Match 0.
            'Team C', 'Team D', // Match 1.
            'Team E', 'Team F', // Match 2.
            'Team G', 'Team Z', // Match 3.
        ]);

        assert.strictEqual((await storage.select('match', 0)).opponent1.id, 0);
        assert.strictEqual((await storage.select('match', 3)).opponent2.id, 8);
        assert.strictEqual((await storage.select('participant')).length, 9);
    });

    it('should update the seeding in a stage on non-locked matches', async () => {
        await manager.update.seeding(0, [
            'Team 1', 'Team 2',
            'Team 3', 'Team 4',
            'Team 5', 'Team 6',
            'Team 7', 'Team 8',
        ]);

        await manager.update.match({
            id: 2, // Any match id.
            opponent1: { score: 1 },
            opponent2: { score: 0 },
        });

        await manager.update.seeding(0, [
            'Team A', 'Team B', // Match 0.
            'Team C', 'Team D', // Match 1.
            'Team 5', 'Team 6', // Match 2. NO CHANGE.
            'Team G', 'Team H', // Match 3.
        ]);

        assert.strictEqual((await storage.select('match', 0)).opponent1.id, 8); // New id.
        assert.strictEqual((await storage.select('match', 2)).opponent1.id, 4); // Still old id.
        assert.strictEqual((await storage.select('participant')).length, 8 + 6);
    });

    it('should throw if a match is locked and would have to be changed', async () => {
        await manager.update.seeding(0, [
            'Team 1', 'Team 2',
            'Team 3', 'Team 4',
            'Team 5', 'Team 6',
            'Team 7', 'Team 8',
        ]);

        await manager.update.match({
            id: 2, // Any match id.
            opponent1: { score: 1 },
            opponent2: { score: 0 },
        });

        await assert.isRejected(manager.update.seeding(0, [
            'Team A', 'Team B', // Match 0.
            'Team C', 'Team D', // Match 1.
            'WILL', 'THROW',    // Match 2.
            'Team G', 'Team H', // Match 3.
        ]), 'A match is locked.');
    });

    it('should throw if the new seeding doesn\'t have the correct size', async () => {
        await manager.update.seeding(0, [
            'Team 1', 'Team 2',
            'Team 3', 'Team 4',
            'Team 5', 'Team 6',
            'Team 7', 'Team 8',
        ]);

        await assert.isRejected(manager.update.seeding(0, [
            'Team A', 'Team B',
            'Team C', 'Team D',
            'Team E', 'Team F',
            'Team G', // Missing value.
        ]), 'The size of the seeding is incorrect.');
    });
});
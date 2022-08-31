const chai = require('chai');
chai.use(require('chai-as-promised'));

const assert = chai.assert;
const { Status } = require('brackets-model');
const { BracketsManager } = require('../dist');
const { JsonDatabase } = require('brackets-json-db');

const storage = new JsonDatabase();
const manager = new BracketsManager(storage);
//eslint-disable-next-line  @typescript-eslint/explicit-function-return-type
const createTournament = (tournamentType) => ({
    name: 'Amateur',
    tournamentId: 0,
    type: tournamentType,
    seeding: [
        { name: 'Team0', nationality: 'US' },
        { name: 'Team1', nationality: 'US' },
        { name: 'Team2', nationality: 'US' },
        { name: 'Team3', nationality: 'US' },
        { name: 'Team4', nationality: 'US' },
        { name: 'Team5', nationality: 'US' },
        { name: 'Team6', nationality: 'US' },
        { name: 'Team7', nationality: 'US' },
        { name: 'Team8', nationality: 'US' },
        { name: 'Team9', nationality: 'US' },
        { name: 'Team10', nationality: 'US' },
        { name: 'Team11', nationality: 'US' },
        { name: 'Team12', nationality: 'US' },
        { name: 'Team13', nationality: 'US' },
        { name: 'Team14', nationality: 'US' },
        { name: 'Team15', nationality: 'US' },
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

    it('should create single elimintation with custom seeding', async () => {
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
describe('Update matches with custom seeding', () => {
    before(async () => {
        storage.reset();
        await manager.create(createTournament('double_elimination'));
    });

    it('should start a match', async () => {
        const before = await storage.select('match', 0);
        assert.strictEqual(before.status, Status.Ready);

        await manager.update.match({
            id: 0,
            opponent1: { score: 0 },
            opponent2: { score: 0 },
        });

        const after = await storage.select('match', 0);
        assert.strictEqual(after.status, Status.Running);
    });

    it('should update the scores for a match and set it to running', async () => {
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

    it('should change the winner of the match and update in the next match', async () => {
        await manager.update.match({
            id: 0,
            opponent1: { result: 'win' },
        });

        assert.strictEqual((await storage.select('match', 8)).opponent1.id, 0);

        await manager.update.match({
            id: 0,
            opponent2: { result: 'win' },
        });

        const after = await storage.select('match', 0);
        assert.strictEqual(after.status, Status.Completed);
        assert.strictEqual(after.opponent1.result, 'loss');
        assert.strictEqual(after.opponent2.result, 'win');

        const nextMatch = await storage.select('match', 8);
        assert.strictEqual(nextMatch.status, Status.Waiting);
        assert.strictEqual(nextMatch.opponent1.id, 1);
    });

    it('should update the status of the next match', async () => {
        await manager.update.match({
            id: 0,
            opponent1: { result: 'win' },
        });

        assert.strictEqual(
            (await storage.select('match', 8)).status,
            Status.Waiting,
        );

        await manager.update.match({
            id: 1,
            opponent1: { result: 'win' },
        });

        assert.strictEqual(
            (await storage.select('match', 8)).status,
            Status.Ready,
        );
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

        await manager.reset.matchResults(2);

        const after = await storage.select('match', 2);
        assert.strictEqual(after.status, Status.Ready);
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

    it('should remove results from a match without score', async () => {
        await manager.update.match({
            id: 0,
            opponent1: { result: 'win' },
            opponent2: { result: 'loss' },
        });

        await manager.reset.matchResults(0);

        const after = await storage.select('match', 0);
        assert.strictEqual(after.status, Status.Ready);
        assert.notExists(after.opponent1.result);
        assert.notExists(after.opponent2.result);
    });

    it('should remove results from a match with score', async () => {
        await manager.update.match({
            id: 0,
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 12, result: 'loss' },
        });

        await manager.reset.matchResults(0);

        const after = await storage.select('match', 0);
        assert.strictEqual(after.status, Status.Running);
        assert.notExists(after.opponent1.result);
        assert.notExists(after.opponent2.result);
    });

    it('should not set the other score to 0 if only one given', async () => {
        // It shouldn't be our decision to set the other score to 0.

        await manager.update.match({
            id: 1,
            opponent1: { score: 1 },
        });

        const after = await storage.select('match', 1);
        assert.strictEqual(after.status, Status.Running);
        assert.strictEqual(after.opponent1.score, 1);
        assert.notExists(after.opponent2.score);
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
        await assert.isRejected(
            manager.update.match({
                id: 3,
                opponent1: { result: 'win' },
                opponent2: { result: 'win' },
            }),
            'There are two winners.',
        );

        await assert.isRejected(
            manager.update.match({
                id: 3,
                opponent1: { result: 'loss' },
                opponent2: { result: 'loss' },
            }),
            'There are two losers.',
        );
    });

    it('should throw if two forfeits', async () => {
        await assert.isRejected(
            manager.update.match({
                id: 3,
                opponent1: { forfeit: true },
                opponent2: { forfeit: true },
            }),
            'There are two forfeits.',
        );
    });

    it('should throw if one forfeit then the other without resetting the match between', async () => {
        await manager.update.match({
            id: 2,
            opponent1: { forfeit: true },
        });

        let after = await storage.select('match', 2);
        assert.strictEqual(after.opponent1.forfeit, true);
        assert.notExists(after.opponent2.forfeit);

        manager.update.match({
            id: 2,
            opponent2: { forfeit: true },
        });
    });
});

describe('Give opponent IDs when updating with custom seeding', () => {
    beforeEach(async () => {
        storage.reset();

        await manager.create({
            name: 'Amateur',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                { name: 'Team 1', nationality: 'US' },
                { name: 'Team 2', nationality: 'US' },
                { name: 'Team 3', nationality: 'US' },
                { name: 'Team 4', nationality: 'US' },
            ],
            settings: { seedOrdering: ['natural'] },
        });
    });

    it('should update the right opponents based on their IDs', async () => {
        await manager.update.match({
            id: 0,
            opponent1: {
                id: 1,
                score: 10,
            },
            opponent2: {
                id: 0,
                score: 5,
            },
        });

        // Actual results must be inverted.
        const after = await storage.select('match', 0);
        assert.strictEqual(after.opponent1.score, 5);
        assert.strictEqual(after.opponent2.score, 10);
    });

    it('should update the right opponent based on its ID, the other one is the remaining one', async () => {
        await manager.update.match({
            id: 0,
            opponent1: {
                id: 1,
                score: 10,
            },
        });

        // Actual results must be inverted.
        const after = await storage.select('match', 0);
        assert.notExists(after.opponent1.score);
        assert.strictEqual(after.opponent2.score, 10);
    });

    it('should throw when the given opponent ID does not exist in the match', async () => {
        await assert.isRejected(
            manager.update.match({
                id: 0,
                opponent1: {
                    id: 2, // Belongs to match id 1.
                    score: 10,
                },
            }),
            /The given opponent[12] ID does not exist in this match./,
        );
    });
});

describe('Locked matches with custom seeding', () => {
    before(async () => {
        storage.reset();
        await manager.create(createTournament('double_elimination'));
    });

    it('should throw when the matches leading to the match have not been completed yet', async () => {
        await assert.isFulfilled(manager.update.match({ id: 0 })); // No problem when no previous match.
        await assert.isRejected(
            manager.update.match({ id: 8 }),
            'The match is locked.',
        ); // First match of WB Round 2.
        await assert.isRejected(
            manager.update.match({ id: 15 }),
            'The match is locked.',
        ); // First match of LB Round 1.
        await assert.isRejected(
            manager.update.match({ id: 19 }),
            'The match is locked.',
        ); // First match of LB Round 1.
        await assert.isRejected(
            manager.update.match({ id: 23 }),
            'The match is locked.',
        ); // First match of LB Round 3.
    });

    it('should throw when one of participants already played next match', async () => {
        await manager.update.match({ id: 0, opponent1: { result: 'win' } });
        await manager.update.match({ id: 1, opponent1: { result: 'win' } });
        await manager.update.match({ id: 8, opponent1: { result: 'win' } });

        await assert.isRejected(
            manager.update.match({ id: 0 }),
            'The match is locked.',
        );
    });
});

describe('Update match games with custom seeding', () => {
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
        assert.strictEqual(
            (await storage.select('match', 0)).status,
            (await storage.select('match_game', 0)).status,
        );

        await manager.update.seeding(0, [
            'Team 1',
            'Team 2',
            'Team 3',
            'Team 4',
        ]);
        assert.strictEqual(
            (await storage.select('match', 0)).status,
            (await storage.select('match_game', 0)).status,
        );

        // Semi 1
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
        assert.strictEqual(
            (await storage.select('match', 0)).status,
            Status.Completed,
        );
        assert.strictEqual(
            (await storage.select('match', 0)).opponent1.score,
            2,
        );
        assert.strictEqual(
            (await storage.select('match', 0)).opponent2.score,
            0,
        );

        let finalMatchStatus = (await storage.select('match', 2)).status;
        assert.strictEqual(finalMatchStatus, Status.Waiting);
        assert.strictEqual(
            finalMatchStatus,
            (await storage.select('match_game', 4)).status,
        );

        // Semi 2
        await manager.update.matchGame({
            parent_id: 1,
            number: 1,
            opponent2: { result: 'win' },
        });
        await manager.update.matchGame({
            parent_id: 1,
            number: 2,
            opponent2: { result: 'win' },
        });

        finalMatchStatus = (await storage.select('match', 2)).status;
        assert.strictEqual(finalMatchStatus, Status.Ready);
        assert.strictEqual(
            finalMatchStatus,
            (await storage.select('match_game', 4)).status,
        );

        // Final
        await manager.update.matchGame({
            parent_id: 2,
            number: 1,
            opponent1: { result: 'win' },
        });
        await manager.update.matchGame({
            parent_id: 2,
            number: 2,
            opponent1: { result: 'win' },
        });

        finalMatchStatus = (await storage.select('match', 2)).status;
        assert.strictEqual(finalMatchStatus, Status.Completed);
        assert.strictEqual(
            finalMatchStatus,
            (await storage.select('match_game', 4)).status,
        );

        const semi1Status = (await storage.select('match', 0)).status;
        assert.strictEqual(semi1Status, Status.Archived);
        assert.strictEqual(
            semi1Status,
            (await storage.select('match_game', 0)).status,
        );

        const semi2Status = (await storage.select('match', 1)).status;
        assert.strictEqual(semi2Status, Status.Archived);
        assert.strictEqual(
            semi2Status,
            (await storage.select('match_game', 2)).status,
        );
    });

    it('should update parent score when match game is updated', async () => {
        await manager.create({
            name: 'With match games',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                { name: 'Team 1', nationality: 'US' },
                { name: 'Team 2', nationality: 'US' },
                { name: 'Team 3', nationality: 'US' },
                { name: 'Team 4', nationality: 'US' },
            ],
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

        await manager.reset.matchGameResults(1);
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

        await assert.isRejected(
            manager.update.matchGame({ id: 0 }),
            'The match game is locked.',
        );

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
        await assert.isRejected(
            manager.update.matchGame({ id: 0 }),
            'The match game is locked.',
        );
    });

    it('should throw if trying to update a child game of a locked match', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                { name: 'Team 1', nationality: 'US' },
                { name: 'Team 2', nationality: 'US' },
                { name: 'Team 3', nationality: 'US' },
                { name: 'Team 4', nationality: 'US' },
            ],
            settings: {
                seedOrdering: ['natural'],
                matchesChildCount: 3, // Bo3
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

        await manager.update.matchGame({
            parent_id: 1,
            number: 1,
            opponent1: { result: 'win' },
        });
        await manager.update.matchGame({
            parent_id: 1,
            number: 2,
            opponent1: { result: 'win' },
        });

        // Starting the next match will lock previous matches and their match games.
        await manager.update.matchGame({
            parent_id: 2,
            number: 1,
            opponent1: { score: 0 },
            opponent2: { score: 0 },
        });

        await assert.isRejected(
            manager.update.matchGame({
                parent_id: 0,
                number: 1,
                opponent1: { result: 'loss' },
            }),
            'The match game is locked.',
        );
        await assert.isRejected(
            manager.update.matchGame({
                parent_id: 0,
                number: 2,
                opponent1: { result: 'loss' },
            }),
            'The match game is locked.',
        );
        await assert.isRejected(
            manager.update.matchGame({
                parent_id: 1,
                number: 1,
                opponent1: { result: 'loss' },
            }),
            'The match game is locked.',
        );
        await assert.isRejected(
            manager.update.matchGame({
                parent_id: 1,
                number: 2,
                opponent1: { result: 'loss' },
            }),
            'The match game is locked.',
        );
    });

    it('should propagate the winner of the parent match in the next match', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                { name: 'Team 1', nationality: 'US' },
                { name: 'Team 2', nationality: 'US' },
                { name: 'Team 3', nationality: 'US' },
                { name: 'Team 4', nationality: 'US' },
            ],
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
            seeding: [
                { name: 'Team 1', nationality: 'US' },
                { name: 'Team 2', nationality: 'US' },
                { name: 'Team 3', nationality: 'US' },
                { name: 'Team 4', nationality: 'US' },
            ],
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

        assert.strictEqual(
            (await storage.select('match', 0)).opponent1.score,
            2,
        );
    });

    it('should throw if trying to reset the results of a parent match', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                { name: 'Team 1', nationality: 'US' },
                { name: 'Team 2', nationality: 'US' },
            ],
            settings: {
                matchesChildCount: 3,
            },
        });

        await assert.isRejected(
            manager.reset.matchResults(0),
            'The parent match is controlled by its child games and its result cannot be reset.',
        );
    });

    it('should reset the results of a parent match when a child game\'s results are reset', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                { name: 'Team 1', nationality: 'US' },
                { name: 'Team 2', nationality: 'US' },
            ],
            settings: {
                matchesChildCount: 3,
            },
        });

        await manager.update.matchGame({ id: 0, opponent1: { result: 'win' } });
        await manager.update.matchGame({ id: 1, opponent1: { result: 'win' } });
        assert.strictEqual(
            (await storage.select('match', 0)).status,
            Status.Completed,
        );

        await manager.reset.matchGameResults(0);
        assert.strictEqual(
            (await storage.select('match', 0)).status,
            Status.Running,
        );
    });

    it('should reset the forfeit of a parent match', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                { name: 'Team 1', nationality: 'US' },
                { name: 'Team 2', nationality: 'US' },
            ],
            settings: {
                matchesChildCount: 3,
            },
        });

        await manager.update.match({ id: 0, opponent1: { forfeit: true } });
        await manager.reset.matchResults(0);
    });
});

describe('Seeding with custom seeding', () => {
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

    it('should update the custom seeding in a stage without any participant', async () => {
        await manager.update.seeding(0, [
            { name: 'Team1', nationality: 'US' },
            { name: 'Team2', nationality: 'US' },
            { name: 'Team3', nationality: 'US' },
            { name: 'Team4', nationality: 'US' },
            { name: 'Team5', nationality: 'US' },
            { name: 'Team6', nationality: 'US' },
            { name: 'Team7', nationality: 'US' },
            { name: 'Team8', nationality: 'US' },
        ]);

        assert.strictEqual((await storage.select('match', 0)).opponent1.id, 0);
        assert.strictEqual((await storage.select('participant')).length, 8);
    });

    it('should update the custom seeding to remove participants', async () => {
        await manager.update.seeding(0, [
            { name: 'Team1', nationality: 'US' },
            { name: 'Team2', nationality: 'US' },
            null,
            { name: 'Team4', nationality: 'US' },
            { name: 'Team5', nationality: 'US' },
            { name: 'Team6', nationality: 'US' },
            { name: 'Team7', nationality: 'US' },
            null,
        ]);

        assert.strictEqual((await storage.select('match', 0)).opponent1.id, 0);

        // In this context, a `null` value is not a BYE, but a TDB (to be determined)
        // because we consider the tournament might have been started.
        // If it's not and you prefer BYEs, just recreate the tournament.
        assert.strictEqual(
            (await storage.select('match', 1)).opponent1.id,
            null,
        );
        assert.strictEqual(
            (await storage.select('match', 3)).opponent2.id,
            null,
        );
    });

    it('should handle incomplete seeding during seeding update', async () => {
        await manager.update.seeding(0, [
            { name: 'Team1', nationality: 'US' },
            { name: 'Team2', nationality: 'US' },
        ]);
        assert.strictEqual((await storage.select('match', 0)).opponent1.id, 0);
        assert.strictEqual((await storage.select('match', 0)).opponent2.id, 1);

        // Same here, see comments above.
        assert.strictEqual(
            (await storage.select('match', 1)).opponent1.id,
            null,
        );
        assert.strictEqual(
            (await storage.select('match', 1)).opponent2.id,
            null,
        );
    });

    it('should update BYE to TBD during seeding update', async () => {
        storage.reset();

        await manager.create({
            name: 'With participants and BYEs',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                null,
                { name: 'Team2', nationality: 'US' },
                { name: 'Team3', nationality: 'US' },
                { name: 'Team4', nationality: 'US' },
                { name: 'Team5', nationality: 'US' },
                { name: 'Team6', nationality: 'US' },
                { name: 'Team7', nationality: 'US' },
                { name: 'Team8', nationality: 'US' },
            ],
            settings: {
                seedOrdering: ['natural'],
            },
        });

        assert.strictEqual((await storage.select('match', 0)).opponent1, null);

        await manager.update.seeding(0, [
            null,
            { name: 'Team2', nationality: 'US' },
            { name: 'Team3', nationality: 'US' },
            { name: 'Team4', nationality: 'US' },
            { name: 'Team5', nationality: 'US' },
            { name: 'Team6', nationality: 'US' },
            { name: 'Team7', nationality: 'US' },
            { name: 'Team8', nationality: 'US' },
        ]);

        // To stay consistent with the fact that `update.seeding()` uses TBD and not BYE,
        // the BYE should be updated to TDB here.
        assert.strictEqual(
            (await storage.select('match', 0)).opponent1.id,
            null,
        );
    });

    it('should reset the seeding of a stage', async () => {
        await manager.update.seeding(0, [
            { name: 'Team1', nationality: 'US' },
            { name: 'Team2', nationality: 'US' },
            { name: 'Team3', nationality: 'US' },
            { name: 'Team4', nationality: 'US' },
            { name: 'Team5', nationality: 'US' },
            { name: 'Team6', nationality: 'US' },
            { name: 'Team7', nationality: 'US' },
            { name: 'Team8', nationality: 'US' },
        ]);

        await manager.reset.seeding(0);

        assert.strictEqual(
            (await storage.select('match', 0)).opponent1.id,
            null,
        );
        assert.strictEqual((await storage.select('participant')).length, 8); // Participants aren't removed.
    });

    it('should update the seeding in a stage with participants already', async () => {
        await manager.update.seeding(0, [
            { name: 'Team1', nationality: 'US' },
            { name: 'Team2', nationality: 'US' },
            { name: 'Team3', nationality: 'US' },
            { name: 'Team4', nationality: 'US' },
            { name: 'Team5', nationality: 'US' },
            { name: 'Team6', nationality: 'US' },
            { name: 'Team7', nationality: 'US' },
            { name: 'Team8', nationality: 'US' },
        ]);

        await manager.update.seeding(0, [
            { name: 'Team A', nationality: 'US' },
            { name: 'Team B', nationality: 'US' },
            { name: 'Team C', nationality: 'US' },
            { name: 'Team D', nationality: 'US' },
            { name: 'Team E', nationality: 'US' },
            { name: 'Team F', nationality: 'US' },
            { name: 'Team G', nationality: 'US' },
            { name: 'Team H', nationality: 'US' },
        ]);

        assert.strictEqual((await storage.select('match', 0)).opponent1.id, 8);
        assert.strictEqual((await storage.select('participant')).length, 16);
    });

    it('should update the seeding in a stage by registering only one missing participant', async () => {
        await manager.update.seeding(0, [
            { name: 'Team A', nationality: 'US' },
            { name: 'Team B', nationality: 'US' },
            { name: 'Team C', nationality: 'US' },
            { name: 'Team D', nationality: 'US' },
            { name: 'Team E', nationality: 'US' },
            { name: 'Team F', nationality: 'US' },
            { name: 'Team G', nationality: 'US' },
            { name: 'Team H', nationality: 'US' },
        ]);

        await manager.update.seeding(0, [
            { name: 'Team A', nationality: 'US' },
            { name: 'Team B', nationality: 'US' },
            { name: 'Team C', nationality: 'US' },
            { name: 'Team D', nationality: 'US' },
            { name: 'Team E', nationality: 'US' },
            { name: 'Team F', nationality: 'US' },
            { name: 'Team G', nationality: 'US' },
            { name: 'Team Z', nationality: 'US' },
        ]);

        assert.strictEqual((await storage.select('match', 0)).opponent1.id, 0);
        assert.strictEqual((await storage.select('match', 3)).opponent2.id, 8);
        assert.strictEqual((await storage.select('participant')).length, 9);
    });

    it('should update the seeding in a stage on non-locked matches', async () => {
        await manager.update.seeding(0, [
            { name: 'Team 1', nationality: 'US' },
            { name: 'Team 2', nationality: 'US' },
            { name: 'Team 3', nationality: 'US' },
            { name: 'Team 4', nationality: 'US' },
            { name: 'Team 5', nationality: 'US' },
            { name: 'Team 6', nationality: 'US' },
            { name: 'Team 7', nationality: 'US' },
            { name: 'Team 8', nationality: 'US' },
        ]);

        await manager.update.match({
            id: 2, // Any match id.
            opponent1: { score: 1 },
            opponent2: { score: 0 },
        });

        await manager.update.seeding(0, [
            { name: 'Team A', nationality: 'US' }, // Match 0.
            { name: 'Team B', nationality: 'US' },
            { name: 'Team C', nationality: 'US' }, // Match 1.
            { name: 'Team D', nationality: 'US' },
            { name: 'Team 5', nationality: 'US' }, // Match 2. NO CHANGE.
            { name: 'Team 6', nationality: 'US' },
            { name: 'Team G', nationality: 'US' }, // Match 3.
            { name: 'Team H', nationality: 'US' },
        ]);

        assert.strictEqual((await storage.select('match', 0)).opponent1.id, 8); // New id.
        assert.strictEqual((await storage.select('match', 2)).opponent1.id, 4); // Still old id.
        assert.strictEqual((await storage.select('participant')).length, 8 + 6);
    });

    it('should update the seeding and keep completed matches completed', async () => {
        await manager.update.seeding(0, [
            { name: 'Team1', nationality: 'US' },
            { name: 'Team2', nationality: 'US' },
            { name: 'Team3', nationality: 'US' },
            { name: 'Team4', nationality: 'US' },
            { name: 'Team5', nationality: 'US' },
            { name: 'Team6', nationality: 'US' },
            { name: 'Team7', nationality: 'US' },
            { name: 'Team8', nationality: 'US' },
        ]);

        await manager.update.match({
            id: 0,
            opponent1: { score: 1, result: 'win' },
            opponent2: { score: 0 },
        });

        await manager.update.seeding(0, [
            { name: 'Team1', nationality: 'US' },
            { name: 'Team2', nationality: 'US' },
            { name: 'Team4', nationality: 'US' },
            { name: 'Team3', nationality: 'US' },
            { name: 'Team6', nationality: 'US' },
            { name: 'Team5', nationality: 'US' },
            { name: 'Team8', nationality: 'US' },
            { name: 'Team7', nationality: 'US' },
        ]);

        const match = await storage.select('match', 0);
        assert.strictEqual(match.opponent1.result, 'win');
        assert.strictEqual(match.status, Status.Completed);
    });

    it('should throw if a match is completed and would have to be changed', async () => {
        await manager.update.seeding(0, [
            { name: 'Team1', nationality: 'US' },
            { name: 'Team2', nationality: 'US' },
            { name: 'Team3', nationality: 'US' },
            { name: 'Team4', nationality: 'US' },
            { name: 'Team5', nationality: 'US' },
            { name: 'Team6', nationality: 'US' },
            { name: 'Team7', nationality: 'US' },
            { name: 'Team8', nationality: 'US' },
        ]);

        await manager.update.match({
            id: 0,
            opponent1: { score: 1, result: 'win' },
            opponent2: { score: 0 },
        });

        await assert.isRejected(
            manager.update.seeding(0, [
                { name: 'Team2', nationality: 'US' },
                { name: 'Team1', nationality: 'US' },
                { name: 'Team3', nationality: 'US' },
                { name: 'Team4', nationality: 'US' },
                { name: 'Team5', nationality: 'US' },
                { name: 'Team6', nationality: 'US' },
                { name: 'Team7', nationality: 'US' },
                { name: 'Team8', nationality: 'US' },
            ]),
            'A match is locked.',
        );
    });

    it('should throw if a match is locked and would have to be changed', async () => {
        await manager.update.seeding(0, [
            { name: 'Team1', nationality: 'US' },
            { name: 'Team2', nationality: 'US' },
            { name: 'Team3', nationality: 'US' },
            { name: 'Team4', nationality: 'US' },
            { name: 'Team5', nationality: 'US' },
            { name: 'Team6', nationality: 'US' },
            { name: 'Team7', nationality: 'US' },
            { name: 'Team8', nationality: 'US' },
        ]);

        await manager.update.match({
            id: 2, // Any match id.
            opponent1: { score: 1 },
            opponent2: { score: 0 },
        });

        await assert.isRejected(
            manager.update.seeding(0, [
                { name: 'Team A', nationality: 'US' },
                { name: 'Team B', nationality: 'US' },
                { name: 'Team C', nationality: 'US' },
                { name: 'Team D', nationality: 'US' },
                { name: 'WILL', nationality: 'US' },
                { name: 'THROW', nationality: 'US' },
                { name: 'Team G', nationality: 'US' },
                { name: 'Team H', nationality: 'US' },
            ]),
            'A match is locked.',
        );
    });

    it('should throw if the seeding has duplicate participants', async () => {
        await assert.isRejected(
            manager.update.seeding(0, [
                { name: 'Team1', nationality: 'US' },
                { name: 'Team1', nationality: 'US' }, // Duplicate
                { name: 'Team3', nationality: 'US' },
                { name: 'Team4', nationality: 'US' },
                { name: 'Team5', nationality: 'US' },
                { name: 'Team6', nationality: 'US' },
                { name: 'Team7', nationality: 'US' },
                { name: 'Team8', nationality: 'US' },
            ]),
            'The seeding has a duplicate participant.',
        );
    });

    it('should confirm the current seeding', async () => {
        await manager.update.seeding(0, [
            { name: 'Team1', nationality: 'US' },
            { name: 'Team2', nationality: 'US' },
            null,
            { name: 'Team4', nationality: 'US' },
            { name: 'Team5', nationality: 'US' },
            null,
            null,
            null,
        ]);

        assert.strictEqual(
            (await storage.select('match', 1)).opponent1.id,
            null,
        ); // First, is a TBD.
        assert.strictEqual(
            (await storage.select('match', 2)).opponent2.id,
            null,
        );
        assert.strictEqual(
            (await storage.select('match', 3)).opponent1.id,
            null,
        );
        assert.strictEqual(
            (await storage.select('match', 3)).opponent2.id,
            null,
        );

        await manager.update.confirmSeeding(0);

        assert.strictEqual((await storage.select('participant')).length, 4);

        assert.strictEqual((await storage.select('match', 1)).opponent1, null); // Should become a BYE.
        assert.strictEqual((await storage.select('match', 2)).opponent2, null);
        assert.strictEqual((await storage.select('match', 3)).opponent1, null);
        assert.strictEqual((await storage.select('match', 3)).opponent2, null);

        assert.strictEqual((await storage.select('match', 5)).opponent2, null); // A BYE should be propagated here.

        assert.strictEqual((await storage.select('match', 7)).opponent2, null); // All of these too (in loser bracket).
        assert.strictEqual((await storage.select('match', 8)).opponent1, null);
        assert.strictEqual((await storage.select('match', 8)).opponent2, null);
        assert.strictEqual((await storage.select('match', 9)).opponent1, null);
        assert.strictEqual((await storage.select('match', 10)).opponent2, null);
    });
});

describe('Match games status with custom seeding', () => {
    beforeEach(() => {
        storage.reset();
    });

    it('should have all the child games to Locked when the parent match is Locked', async () => {
        await manager.create({
            tournamentId: 0,
            name: 'Example',
            type: 'single_elimination',
            seeding: [
                { name: 'Team1', nationality: 'US' },
                { name: 'Team2', nationality: 'US' },
                { name: 'Team3', nationality: 'US' },
                { name: 'Team4', nationality: 'US' },
            ],
            settings: { matchesChildCount: 3 },
        });

        const games = await storage.select('match_game', { parent_id: 2 });
        assert.strictEqual(games[0].status, Status.Locked);
        assert.strictEqual(games[1].status, Status.Locked);
        assert.strictEqual(games[2].status, Status.Locked);
    });

    it('should set all the child games to Waiting', async () => {
        await manager.create({
            tournamentId: 0,
            name: 'Example',
            type: 'single_elimination',
            seeding: [
                { name: 'Team1', nationality: 'US' },
                { name: 'Team2', nationality: 'US' },
                { name: 'Team3', nationality: 'US' },
                { name: 'Team4', nationality: 'US' },
            ],
            settings: { matchesChildCount: 3 },
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

        const games = await storage.select('match_game', { parent_id: 2 });
        assert.strictEqual(games[0].status, Status.Waiting);
        assert.strictEqual(games[1].status, Status.Waiting);
        assert.strictEqual(games[2].status, Status.Waiting);
    });

    it('should set all the child games to Ready', async () => {
        await manager.create({
            tournamentId: 0,
            name: 'Example',
            type: 'single_elimination',
            seeding: [
                { name: 'Team1', nationality: 'US' },
                { name: 'Team2', nationality: 'US' },
                { name: 'Team3', nationality: 'US' },
                { name: 'Team4', nationality: 'US' },
            ],
            settings: { matchesChildCount: 3 },
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

        await manager.update.matchGame({
            parent_id: 1,
            number: 1,
            opponent1: { result: 'win' },
        });
        await manager.update.matchGame({
            parent_id: 1,
            number: 2,
            opponent1: { result: 'win' },
        });

        const games = await storage.select('match_game', { parent_id: 2 });
        assert.strictEqual(games[0].status, Status.Ready);
        assert.strictEqual(games[1].status, Status.Ready);
        assert.strictEqual(games[2].status, Status.Ready);
    });

    it('should set the parent match to Running when one match game starts', async () => {
        await manager.create({
            tournamentId: 0,
            name: 'Example',
            type: 'single_elimination',
            seeding: [
                { name: 'Team 1', nationality: 'US' },
                { name: 'Team 2', nationality: 'US' },
                { name: 'Team 3', nationality: 'US' },
                { name: 'Team 4', nationality: 'US' },
            ],
            settings: { matchesChildCount: 3 },
        });

        await manager.update.matchGame({
            id: 1,
            opponent1: { score: 0 },
            opponent2: { score: 0 },
        });

        const games = await storage.select('match_game', { parent_id: 0 });

        // Siblings are left untouched.
        assert.strictEqual(games[0].status, Status.Ready);
        assert.strictEqual(games[2].status, Status.Ready);

        assert.strictEqual(games[1].status, Status.Running);
        assert.strictEqual(
            (await storage.select('match', 0)).status,
            Status.Running,
        );
    });

    it('should set the child game to Completed without changing the siblings or the parent match status', async () => {
        await manager.create({
            tournamentId: 0,
            name: 'Example',
            type: 'single_elimination',
            seeding: [
                { name: 'Team 1', nationality: 'US' },
                { name: 'Team 2', nationality: 'US' },
                { name: 'Team 3', nationality: 'US' },
                { name: 'Team 4', nationality: 'US' },
            ],
            settings: { matchesChildCount: 3 },
        });

        await manager.update.matchGame({ id: 1, opponent1: { result: 'win' } });

        const games = await storage.select('match_game', { parent_id: 0 });

        // Siblings and parent match are left untouched.
        assert.strictEqual(games[0].status, Status.Ready);
        assert.strictEqual(games[2].status, Status.Ready);
        assert.strictEqual(
            (await storage.select('match', 0)).status,
            Status.Running,
        );

        assert.strictEqual(games[1].status, Status.Completed);
    });

    it('should set the parent match to Completed', async () => {
        await manager.create({
            tournamentId: 0,
            name: 'Example',
            type: 'single_elimination',
            seeding: [
                { name: 'Team1', nationality: 'US' },
                { name: 'Team2', nationality: 'US' },
                { name: 'Team3', nationality: 'US' },
                { name: 'Team4', nationality: 'US' },
            ],
            settings: { matchesChildCount: 3 },
        });

        await manager.update.matchGame({ id: 0, opponent1: { result: 'win' } });
        await manager.update.matchGame({ id: 1, opponent1: { result: 'win' } });
        assert.strictEqual(
            (await storage.select('match', 0)).status,
            Status.Completed,
        );

        // Left untouched, can be played if we want.
        assert.strictEqual(
            (await storage.select('match_game', 2)).status,
            Status.Ready,
        );

        await manager.update.matchGame({ id: 2, opponent1: { result: 'win' } });
        assert.strictEqual(
            (await storage.select('match', 0)).status,
            Status.Completed,
        );
        assert.strictEqual(
            (await storage.select('match_game', 2)).status,
            Status.Completed,
        );
    });

    it('should archive previous matches and their games when next match is started', async () => {
        await manager.create({
            tournamentId: 0,
            name: 'Example',
            type: 'single_elimination',
            seeding: [
                { name: 'Team1', nationality: 'US' },
                { name: 'Team2', nationality: 'US' },
                { name: 'Team3', nationality: 'US' },
                { name: 'Team4', nationality: 'US' },
            ],
            settings: { matchesChildCount: 3 },
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

        await manager.update.matchGame({
            parent_id: 1,
            number: 1,
            opponent1: { result: 'win' },
        });
        await manager.update.matchGame({
            parent_id: 1,
            number: 2,
            opponent1: { result: 'win' },
        });

        await manager.update.matchGame({
            parent_id: 2,
            number: 1,
            opponent1: { score: 0 },
            opponent2: { score: 0 },
        });

        const firstMatchGames = await storage.select('match_game', {
            parent_id: 0,
        });
        assert.strictEqual(firstMatchGames[0].status, Status.Archived);
        assert.strictEqual(firstMatchGames[1].status, Status.Archived);
        assert.strictEqual(firstMatchGames[2].status, Status.Archived);

        assert.strictEqual(
            (await storage.select('match', 0)).status,
            Status.Archived,
        );

        const secondMatchGames = await storage.select('match_game', {
            parent_id: 1,
        });
        assert.strictEqual(secondMatchGames[0].status, Status.Archived);
        assert.strictEqual(secondMatchGames[1].status, Status.Archived);
        assert.strictEqual(secondMatchGames[2].status, Status.Archived);

        assert.strictEqual(
            (await storage.select('match', 1)).status,
            Status.Archived,
        );
    });

    it('should work with unique match games when controlled via the parent', async () => {
        await manager.create({
            tournamentId: 0,
            name: 'Example',
            type: 'double_elimination',
            seeding: [
                { name: 'Team1', nationality: 'US' },
                { name: 'Team2', nationality: 'US' },
                { name: 'Team3', nationality: 'US' },
                { name: 'Team4', nationality: 'US' },
            ],
            settings: { matchesChildCount: 1 },
        });

        assert.strictEqual(
            (await storage.select('match_game', 2)).status,
            Status.Locked,
        );
        assert.strictEqual(
            (await storage.select('match_game', 3)).status,
            Status.Locked,
        );

        await manager.update.match({
            id: 0,
            opponent1: { score: 2, result: 'win' },
            opponent2: { score: 1 },
        });

        assert.strictEqual(
            (await storage.select('match_game', 2)).status,
            Status.Waiting,
        );
        assert.strictEqual(
            (await storage.select('match_game', 3)).status,
            Status.Waiting,
        );

        await manager.update.match({
            id: 1,
            opponent1: { score: 1 },
            opponent2: { score: 2, result: 'win' },
        });

        assert.strictEqual(
            (await storage.select('match_game', 2)).status,
            Status.Ready,
        );
        assert.strictEqual(
            (await storage.select('match_game', 3)).status,
            Status.Ready,
        );
    });

    it('should work with unique match games when controlled via the child games', async () => {
        await manager.create({
            tournamentId: 0,
            name: 'Example',
            type: 'double_elimination',
            seeding: [
                { name: 'Team1', nationality: 'US' },
                { name: 'Team2', nationality: 'US' },
                { name: 'Team3', nationality: 'US' },
                { name: 'Team4', nationality: 'US' },
            ],
            settings: { matchesChildCount: 1 },
        });

        assert.strictEqual(
            (await storage.select('match_game', 2)).status,
            Status.Locked,
        );
        assert.strictEqual(
            (await storage.select('match_game', 3)).status,
            Status.Locked,
        );

        await manager.update.matchGame({
            id: 0,
            opponent1: { score: 2, result: 'win' },
            opponent2: { score: 1 },
        });

        assert.strictEqual(
            (await storage.select('match_game', 2)).status,
            Status.Waiting,
        );
        assert.strictEqual(
            (await storage.select('match_game', 3)).status,
            Status.Waiting,
        );

        await manager.update.matchGame({
            id: 1,
            opponent1: { score: 1 },
            opponent2: { score: 2, result: 'win' },
        });

        assert.strictEqual(
            (await storage.select('match_game', 2)).status,
            Status.Ready,
        );
        assert.strictEqual(
            (await storage.select('match_game', 3)).status,
            Status.Ready,
        );
    });
});

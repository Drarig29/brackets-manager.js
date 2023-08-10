const { Status } = require('brackets-model');
const chai = require('chai');
chai.use(require('chai-as-promised'));

const assert = chai.assert;
const { BracketsManager } = require('../dist');
const { JsonDatabase } = require('brackets-json-db');

const storage = new JsonDatabase();
const manager = new BracketsManager(storage);

describe('Create double elimination stage', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should create a double elimination stage', async () => {
        await manager.create.stage({
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
        assert.strictEqual(stage.name, 'Amateur');
        assert.strictEqual(stage.type, 'double_elimination');

        assert.strictEqual((await storage.select('group')).length, 3);
        assert.strictEqual((await storage.select('round')).length, 4 + 6 + 1);
        assert.strictEqual((await storage.select('match')).length, 30);
    });

    it('should create a double elimination stage with only two participants', async () => {
        // This is an edge case. No lower bracket nor grand final will be created.
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            settings: { size: 2 },
        });

        assert.strictEqual((await storage.select('group')).length, 1);
        assert.strictEqual((await storage.select('round')).length, 1);
        assert.strictEqual((await storage.select('match')).length, 1);

        // Ensure update works.
        await manager.update.seeding(0, ['Team 1', 'Team 2']);
        await manager.update.match({
            id: 0,
            opponent1: { result: 'win' },
        });
    });

    it('should create a tournament with 256+ tournaments', async () => {
        await manager.create.stage({
            name: 'Example with 256 participants',
            tournamentId: 0,
            type: 'double_elimination',
            settings: { size: 256 },
        });
    });

    it('should create a tournament with a double grand final', async () => {
        await manager.create.stage({
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

        assert.strictEqual((await storage.select('group')).length, 3);
        assert.strictEqual((await storage.select('round')).length, 3 + 4 + 2 /* grand final */);
        assert.strictEqual((await storage.select('match')).length, 15);
    });

    it('should create a tournament with a double grand final and a consolation final', async () => {
        await manager.create.stage({
            name: 'Example with double grand final',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: {
                grandFinal: 'double',
                consolationFinal: true,
                seedOrdering: ['natural'],
            },
        });

        assert.strictEqual((await storage.select('group')).length, 3);
        assert.strictEqual((await storage.select('round')).length, 3 + 4 + 2 /* grand final */ + 1 /* consolation final */);
        assert.strictEqual((await storage.select('match')).length, 16);

        assert.strictEqual((await storage.select('match', 13)).number, 1); // 1st match of grand final is number 1 of its round.
        assert.strictEqual((await storage.select('match', 14)).number, 1); // 2nd match of grand final **also** is number 1 of its round.

        assert.strictEqual((await storage.select('match', 15)).number, 2); // Consolation final is number 2 of its round (arbitrary).
    });
});

describe('Previous and next match update in double elimination stage', () => {
    beforeEach(() => {
        storage.reset();
    });

    it('should end a match and determine next matches', async () => {
        await manager.create.stage({
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
        assert.strictEqual(before.opponent2.id, null);

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

        assert.strictEqual(
            (await storage.select('match', 8)).opponent1.id, // Determined opponent for WB round 2
            (await storage.select('match', 0)).opponent1.id, // Winner of first match round 1
        );

        assert.strictEqual(
            (await storage.select('match', 8)).opponent2.id, // Determined opponent for WB round 2
            (await storage.select('match', 1)).opponent2.id, // Winner of second match round 1
        );

        assert.strictEqual(
            (await storage.select('match', 15)).opponent2.id, // Determined opponent for LB round 1
            (await storage.select('match', 1)).opponent1.id, // Loser of second match round 1
        );

        assert.strictEqual(
            (await storage.select('match', 19)).opponent2.id, // Determined opponent for LB round 2
            (await storage.select('match', 0)).opponent2.id, // Loser of first match round 1
        );
    });

    it('should propagate winner when BYE is already in next match in loser bracket', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', null],
            settings: { grandFinal: 'simple' },
        });

        const firstMatchBye = await storage.select('match', 0);
        assert.strictEqual(firstMatchBye.opponent1.result, 'win'); // Someone vs. BYE has result `win`.
        assert.strictEqual(firstMatchBye.opponent2, null);

        await manager.update.match({
            id: 1, // Second match of WB round 1
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 12 },
        });

        const loserId = (await storage.select('match', 1)).opponent2.id;
        let matchSemiLB = await storage.select('match', 3);

        assert.strictEqual(matchSemiLB.opponent2.id, loserId);
        assert.strictEqual(matchSemiLB.opponent2.result, 'win');
        assert.strictEqual(matchSemiLB.status, Status.Completed);

        assert.strictEqual(
            (await storage.select('match', 4)).opponent2.id, // Propagated winner in LB Final because of the BYE.
            loserId,
        );

        await assert.isRejected(manager.update.match({
            id: 3, // First match of LB round 1
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 12 },
        }), 'The match is locked.');

        await manager.reset.matchResults(1); // Second match of WB round 1

        matchSemiLB = await storage.select('match', 3);
        assert.strictEqual(matchSemiLB.opponent2.id, null);
        assert.strictEqual(matchSemiLB.opponent2.result, undefined);
        assert.strictEqual(matchSemiLB.status, Status.Locked);

        assert.strictEqual((await storage.select('match', 4)).opponent2.id, null); // Propagated winner is removed.
    });

    it('should determine matches in grand final', async () => {
        await manager.create.stage({
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

        assert.strictEqual(
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

        assert.strictEqual(
            (await storage.select('match', 5)).opponent2.id, // Determined opponent for the grand final (round 1)
            (await storage.select('match', 1)).opponent2.id, // Winner of LB Final
        );

        await manager.update.match({
            id: 5, // Grand Final round 1
            opponent1: { score: 10 },
            opponent2: { score: 16, result: 'win' }, // Team 3
        });

        assert.strictEqual(
            (await storage.select('match', 6)).opponent2.id, // Determined opponent for the grand final (round 2)
            (await storage.select('match', 1)).opponent2.id, // Winner of LB Final
        );

        assert.strictEqual((await storage.select('match', 2)).status, Status.Archived);
        assert.strictEqual((await storage.select('match', 4)).status, Status.Archived);

        assert.strictEqual((await storage.select('match', 5)).status, Status.Completed); // Grand final (round 1)
        assert.strictEqual((await storage.select('match', 6)).status, Status.Ready); // Grand final (round 2)

        await manager.update.match({
            id: 6, // Grand Final round 2
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 10 },
        });

        assert.strictEqual((await storage.select('match', 5)).status, Status.Archived); // Grand final (round 1)
        assert.strictEqual((await storage.select('match', 6)).status, Status.Archived); // Grand final (round 2)
    });

    it('should determine matches in grand final (with consolation final)', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: { grandFinal: 'double', consolationFinal: true },
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

        assert.strictEqual(
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

        assert.strictEqual(
            (await storage.select('match', 5)).opponent2.id, // Determined opponent for the grand final (round 1)
            (await storage.select('match', 1)).opponent2.id, // Winner of LB Final
        );

        await manager.update.match({
            id: 5, // Grand Final round 1
            opponent1: { score: 10 },
            opponent2: { score: 16, result: 'win' }, // Team 3
        });

        assert.strictEqual(
            (await storage.select('match', 6)).opponent2.id, // Determined opponent for the grand final (round 2)
            (await storage.select('match', 1)).opponent2.id, // Winner of LB Final
        );

        assert.strictEqual((await storage.select('match', 2)).status, Status.Archived);
        assert.strictEqual((await storage.select('match', 4)).status, Status.Archived);

        assert.strictEqual((await storage.select('match', 5)).status, Status.Completed); // Grand final (round 1)
        assert.strictEqual((await storage.select('match', 6)).status, Status.Ready); // Grand final (round 2)

        await manager.update.match({
            id: 6, // Grand Final round 2
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 10 },
        });

        await manager.update.match({
            id: 7, // Consolation final
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 11 },
        });

        assert.strictEqual((await storage.select('match', 5)).status, Status.Archived); // Grand final (round 1)
        assert.strictEqual((await storage.select('match', 6)).status, Status.Archived); // Grand final (round 2)
    });

    it('should determine next matches and reset them', async () => {
        await manager.create.stage({
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
        assert.strictEqual(beforeReset.opponent1.id, (await storage.select('match', 0)).opponent2.id);
        assert.strictEqual(beforeReset.opponent1.position, 1); // Must be set.

        await manager.reset.matchResults(0); // First match of WB round 1

        const afterReset = await storage.select('match', 3); // Determined opponent for LB round 1
        assert.strictEqual(afterReset.opponent1.id, null);
        assert.strictEqual(afterReset.opponent1.position, 1); // It must stay.
    });

    it('should archive previous matches', async () => {
        await manager.create.stage({
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
        assert.strictEqual((await storage.select('match', 0)).status, Status.Archived);
        assert.strictEqual((await storage.select('match', 1)).status, Status.Archived);

        // Reset the score...
        await manager.update.match({ id: 2, opponent1: { score: undefined }, opponent2: { score: undefined } });

        // ...and reset the result
        await manager.reset.matchResults(2); // WB Final

        // Should remove the archived status
        assert.strictEqual((await storage.select('match', 0)).status, Status.Completed);
        assert.strictEqual((await storage.select('match', 1)).status, Status.Completed);

        await manager.update.match({
            id: 3, // Only match of LB round 1
            opponent1: { score: 12, result: 'win' }, // Team 4
            opponent2: { score: 8 },
        });

        // First round of LB archived both WB round 1 matches
        assert.strictEqual((await storage.select('match', 0)).status, Status.Archived);
        assert.strictEqual((await storage.select('match', 1)).status, Status.Archived);

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

        assert.strictEqual((await storage.select('match', 2)).status, Status.Archived);
        assert.strictEqual((await storage.select('match', 3)).status, Status.Archived);

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

        assert.strictEqual((await storage.select('match', 2)).status, Status.Archived);

        await manager.update.match({
            id: 6, // Grand Final round 2
            opponent1: { score: 10 },
            opponent2: { score: 16, result: 'win' }, // Team 3
        });

        assert.strictEqual((await storage.select('match', 5)).status, Status.Archived);
    });

    it('should choose the correct previous and next matches based on losers ordering', async () => {
        await manager.create.stage({
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
            settings: {
                seedOrdering: ['natural', 'reverse', 'reverse'],
                grandFinal: 'simple',
            },
        });

        await manager.update.match({ id: 0, opponent1: { result: 'win' } }); // WB 1.1
        assert.strictEqual(
            (await storage.select('match', 18)).opponent2.id, // Determined opponent for last match of LB round 1 (reverse ordering for losers)
            (await storage.select('match', 0)).opponent2.id, // Loser of first match round 1
        );

        await manager.update.match({ id: 1, opponent1: { result: 'win' } }); // WB 1.2
        assert.strictEqual(
            (await storage.select('match', 18)).opponent1.id, // Determined opponent for last match of LB round 1 (reverse ordering for losers)
            (await storage.select('match', 1)).opponent2.id, // Loser of second match round 1
        );

        await manager.update.match({ id: 8, opponent1: { result: 'win' } }); // WB 2.1
        assert.strictEqual(
            (await storage.select('match', 22)).opponent1.id, // Determined opponent for last match of LB round 2 (reverse ordering for losers)
            (await storage.select('match', 8)).opponent2.id, // Loser of first match round 2
        );

        await manager.update.match({ id: 6, opponent1: { result: 'win' } }); // WB 1.7
        await manager.update.match({ id: 7, opponent1: { result: 'win' } }); // WB 1.8
        await manager.update.match({ id: 11, opponent1: { result: 'win' } }); // WB 2.4
        await manager.update.match({ id: 15, opponent1: { result: 'win' } }); // LB 1.1
        await manager.update.match({ id: 19, opponent1: { result: 'win' } }); // LB 2.1

        assert.strictEqual((await storage.select('match', 8)).status, Status.Completed); // WB 2.1
        assert.strictEqual((await storage.select('match', 11)).status, Status.Archived); // WB 2.4
    });

    it('should send the losers to the right LB matches in round 1', async () => {
        await manager.create.stage({
            name: 'Example with inner_outer loser ordering',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: {
                seedOrdering: ['inner_outer', 'inner_outer'],
            },
        });

        assert.strictEqual((await storage.select('match', 7)).opponent1.position, 1);
        assert.strictEqual((await storage.select('match', 7)).opponent2.position, 4);
        assert.strictEqual((await storage.select('match', 8)).opponent1.position, 2);
        assert.strictEqual((await storage.select('match', 8)).opponent2.position, 3);

        // Match of position 1.
        await manager.update.match({
            id: 0,
            opponent1: { result: 'win' }, // Loser id: 7.
        });

        assert.strictEqual((await storage.select('match', 7)).opponent1.id, 7);

        // Match of position 2.
        await manager.update.match({
            id: 1,
            opponent1: { result: 'win' }, // Loser id: 4.
        });

        assert.strictEqual((await storage.select('match', 8)).opponent1.id, 4);

        // Match of position 3.
        await manager.update.match({
            id: 2,
            opponent1: { result: 'win' }, // Loser id: 6.
        });

        assert.strictEqual((await storage.select('match', 8)).opponent2.id, 6);

        // Match of position 4.
        await manager.update.match({
            id: 3,
            opponent1: { result: 'win' }, // Loser id: 5.
        });

        assert.strictEqual((await storage.select('match', 7)).opponent2.id, 5);
    });
});

describe('Skip first round', () => {
    beforeEach(async () => {
        storage.reset();

        await manager.create.stage({
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
                grandFinal: 'double',
            },
        });
    });

    it('should create a double elimination stage with skip first round option', async () => {
        assert.strictEqual((await storage.select('group')).length, 3);
        assert.strictEqual((await storage.select('round')).length, 3 + 6 + 2); // One round less in WB.
        assert.strictEqual((await storage.select('match')).length, (4 + 2 + 1) + (4 + 4 + 2 + 2 + 1 + 1) + (1 + 1));

        assert.strictEqual((await storage.select('round', 0)).number, 1); // Even though the "real" first round is skipped, the stored first round's number should be 1.

        assert.strictEqual((await storage.select('match', 0)).opponent1.id, 0); // First match of WB.
        assert.strictEqual((await storage.select('match', 7)).opponent1.id, 1); // First match of LB.
    });

    it('should choose the correct previous and next matches', async () => {
        await manager.update.match({ id: 0, opponent1: { result: 'win' } });
        assert.strictEqual((await storage.select('match', 7)).opponent1.id, 1); // First match of LB Round 1 (must stay).
        assert.strictEqual((await storage.select('match', 12)).opponent1.id, 2); // First match of LB Round 2 (must be updated).

        await manager.update.match({ id: 1, opponent1: { result: 'win' } });
        assert.strictEqual((await storage.select('match', 7)).opponent2.id, 3); // First match of LB Round 1 (must stay).
        assert.strictEqual((await storage.select('match', 11)).opponent1.id, 6); // Second match of LB Round 2 (must be updated).

        await manager.update.match({ id: 4, opponent1: { result: 'win' } }); // First match of WB Round 2.
        assert.strictEqual((await storage.select('match', 18)).opponent1.id, 4); // First match of LB Round 4.

        await manager.update.match({ id: 7, opponent1: { result: 'win' } }); // First match of LB Round 1.
        assert.strictEqual((await storage.select('match', 11)).opponent2.id, 1); // First match of LB Round 2.

        for (let i = 2; i < 21; i++)
            await manager.update.match({ id: i, opponent1: { result: 'win' } });

        assert.strictEqual((await storage.select('match', 15)).opponent1.id, 6); // First match of LB Round 3.

        assert.strictEqual((await storage.select('match', 21)).opponent1.id, 0); // GF Round 1.
        assert.strictEqual((await storage.select('match', 21)).opponent2.id, 8); // GF Round 1.

        await manager.update.match({ id: 21, opponent2: { result: 'win' } });

        assert.strictEqual((await storage.select('match', 21)).opponent1.id, 0); // GF Round 2.
        assert.strictEqual((await storage.select('match', 22)).opponent2.id, 8); // GF Round 2.

        await manager.update.match({ id: 22, opponent2: { result: 'win' } });
    });
});

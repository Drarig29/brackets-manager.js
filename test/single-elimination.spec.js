const chai = require('chai');
chai.use(require('chai-as-promised'));

const assert = chai.assert;
const { Status } = require('brackets-model');
const { BracketsManager } = require('../dist');
const { JsonDatabase } = require('brackets-json-db');

const storage = new JsonDatabase();
const manager = new BracketsManager(storage);

describe('Create single elimination stage', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should create a single elimination stage', async () => {
        const example = {
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
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

        await manager.create.stage(example);

        const stage = await storage.select('stage', 0);
        assert.strictEqual(stage.name, example.name);
        assert.strictEqual(stage.type, example.type);

        assert.strictEqual((await storage.select('group')).length, 1);
        assert.strictEqual((await storage.select('round')).length, 4);
        assert.strictEqual((await storage.select('match')).length, 15);
    });

    it('should create a single elimination stage with manual ordering', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: {
                manualOrdering: [[1, 8, 4, 5, 2, 7, 3, 6]],
            },
        });

        const matches = await storage.select('match');
        assert.strictEqual(matches[0].opponent1.position, 1);
        assert.strictEqual(matches[0].opponent2.position, 8);
        assert.strictEqual(matches[1].opponent1.position, 4);
        assert.strictEqual(matches[1].opponent2.position, 5);
        assert.strictEqual(matches[2].opponent1.position, 2);
        assert.strictEqual(matches[2].opponent2.position, 7);
        assert.strictEqual(matches[3].opponent1.position, 3);
        assert.strictEqual(matches[3].opponent2.position, 6);
    });

    it('should throw if manual ordering for single elimination has more than one group', async () => {
        await assert.isRejected(manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: {
                manualOrdering: [[1, 4], [2, 3]],
            },
        }), 'Manual ordering for an elimination stage must have exactly one group.');
    });

    it('should create a single elimination stage with manual ordering and BYEs', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6'],
            settings: {
                size: 8,
                manualOrdering: [[1, 2, 3, null, 4, 5, 6, null]],
            },
        });

        const matches = await storage.select('match');
        assert.strictEqual(matches[1].opponent1.id, 2); // Team 3 advances automatically.
        assert.strictEqual(matches[1].opponent2, null); // BYE.
        assert.strictEqual(matches[1].status, 0); // Locked (auto-completed).
        assert.strictEqual(matches[3].opponent1.id, 5); // Team 6 advances automatically.
        assert.strictEqual(matches[3].opponent2, null); // BYE.
        assert.strictEqual(matches[3].status, 0); // Locked (auto-completed).
    });

    it('should throw if manual ordering for single elimination has wrong length', async () => {
        await assert.isRejected(manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: {
                manualOrdering: [[1, 2]],
            },
        }), 'Manual ordering does not have the same length as the seeding.');
    });

    it('should create a single elimination stage with BYEs', async () => {
        await manager.create.stage({
            name: 'Example with BYEs',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', null,
                'Team 3', 'Team 4',
                null, null,
                'Team 7', 'Team 8',
            ],
            settings: { seedOrdering: ['natural'] },
        });

        assert.strictEqual((await storage.select('match', 4)).opponent1.id, 0); // Determined because of opponent's BYE.
        assert.strictEqual((await storage.select('match', 4)).opponent2.id, null); // To be determined.
        assert.strictEqual((await storage.select('match', 5)).opponent1, null); // BYE propagated.
        assert.strictEqual((await storage.select('match', 5)).opponent2.id, null); // To be determined.
    });

    it('should create a single elimination stage with consolation final', async () => {
        await manager.create.stage({
            name: 'Example with consolation final',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: { consolationFinal: true, seedOrdering: ['natural'] },
        });

        assert.strictEqual((await storage.select('group')).length, 2);
        assert.strictEqual((await storage.select('round')).length, 4);
        assert.strictEqual((await storage.select('match')).length, 8);
    });

    it('should create a single elimination stage with consolation final and BYEs', async () => {
        await manager.create.stage({
            name: 'Example with consolation final and BYEs',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                null, null,
                null, 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: { consolationFinal: true, seedOrdering: ['natural'] },
        });

        assert.strictEqual((await storage.select('match', 4)).opponent1, null);
        assert.strictEqual((await storage.select('match', 4)).opponent2.id, 0);

        // Consolation final
        assert.strictEqual((await storage.select('match', 7)).opponent1, null);
        assert.strictEqual((await storage.select('match', 7)).opponent2.id, null);
    });

    it('should create a single elimination stage with Bo3 matches', async () => {
        await manager.create.stage({
            name: 'Example with Bo3 matches',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: { seedOrdering: ['natural'], matchesChildCount: 3 },
        });

        assert.strictEqual((await storage.select('group')).length, 1);
        assert.strictEqual((await storage.select('round')).length, 3);
        assert.strictEqual((await storage.select('match')).length, 7);
        assert.strictEqual((await storage.select('match_game')).length, 7 * 3);
    });

    it('should determine the number property of created stages', async () => {
        await manager.create.stage({
            name: 'Stage 1',
            tournamentId: 0,
            type: 'single_elimination',
            settings: { size: 2 },
        });

        assert.strictEqual((await storage.select('stage', 0)).number, 1);

        await manager.create.stage({
            name: 'Stage 2',
            tournamentId: 0,
            type: 'single_elimination',
            settings: { size: 2 },
        });

        assert.strictEqual((await storage.select('stage', 1)).number, 2);

        await manager.delete.stage(0);

        await manager.create.stage({
            name: 'Stage 3',
            tournamentId: 0,
            type: 'single_elimination',
            settings: { size: 2 },
        });

        assert.strictEqual((await storage.select('stage', 2)).number, 3);
    });

    it('should create a stage with the given number property', async () => {
        await manager.create.stage({
            name: 'Stage 1',
            tournamentId: 0,
            type: 'single_elimination',
            settings: { size: 2 },
        });

        await manager.create.stage({
            name: 'Stage 2',
            tournamentId: 0,
            type: 'single_elimination',
            settings: { size: 2 },
        });

        await manager.delete.stage(0);

        await manager.create.stage({
            name: 'Stage 1 (new)',
            tournamentId: 0,
            type: 'single_elimination',
            number: 1,
            settings: { size: 2 },
        });

        assert.strictEqual((await storage.select('stage', 2)).number, 1);
    });

    it('should throw if the given number property already exists', async () => {
        await manager.create.stage({
            name: 'Stage 1',
            tournamentId: 0,
            type: 'single_elimination',
            number: 1,
            settings: { size: 2 },
        });

        await assert.isRejected(manager.create.stage({
            name: 'Stage 1',
            tournamentId: 0,
            type: 'single_elimination',
            number: 1, // Duplicate
            settings: { size: 2 },
        }), 'The given stage number already exists.');
    });

    it('should throw if the seeding has duplicate participants', async () => {
        await assert.isRejected(manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 1', // Duplicate
                'Team 3', 'Team 4',
            ],
        }), 'The seeding has a duplicate participant.');
    });

    it('should throw if trying to set a draw as a result', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
            ],
        });

        await assert.isRejected(manager.update.match({
            id: 0,
            opponent1: { result: 'draw' },
        }), 'Having a draw is forbidden in an elimination tournament.');
    });
});

describe('Previous and next match update in single elimination stage', () => {
    beforeEach(() => {
        storage.reset();
    });

    it('should determine matches in consolation final', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: { consolationFinal: true },
        });

        await manager.update.match({
            id: 0, // First match of round 1
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 12 },
        });

        await manager.update.match({
            id: 1, // Second match of round 1
            opponent1: { score: 13 },
            opponent2: { score: 16, result: 'win' },
        });

        assert.strictEqual(
            (await storage.select('match', 3)).opponent1.id, // Determined opponent for the consolation final
            (await storage.select('match', 0)).opponent2.id, // Loser of Semi 1
        );

        assert.strictEqual(
            (await storage.select('match', 3)).opponent2.id, // Determined opponent for the consolation final
            (await storage.select('match', 1)).opponent1.id, // Loser of Semi 2
        );

        assert.strictEqual((await storage.select('match', 2)).status, Status.Ready);
        assert.strictEqual((await storage.select('match', 3)).status, Status.Ready);
    });

    it('should play both the final and consolation final in parallel', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: { consolationFinal: true },
        });

        await manager.update.match({
            id: 0, // First match of round 1
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 12 },
        });

        await manager.update.match({
            id: 1, // Second match of round 1
            opponent1: { score: 13 },
            opponent2: { score: 16, result: 'win' },
        });

        await manager.update.match({
            id: 2, // Final
            opponent1: { score: 12 },
            opponent2: { score: 9 },
        });

        assert.strictEqual((await storage.select('match', 2)).status, Status.Running);
        assert.strictEqual((await storage.select('match', 3)).status, Status.Ready);

        await manager.update.match({
            id: 3, // Consolation final
            opponent1: { score: 12 },
            opponent2: { score: 9 },
        });

        assert.strictEqual((await storage.select('match', 2)).status, Status.Running);
        assert.strictEqual((await storage.select('match', 3)).status, Status.Running);

        await manager.update.match({
            id: 3, // Consolation final
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 9 },
        });

        assert.strictEqual((await storage.select('match', 2)).status, Status.Running);
        assert.strictEqual((await storage.select('match', 3)).status, Status.Completed);

        await manager.update.match({
            id: 2, // Final
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 9 },
        });

        assert.strictEqual((await storage.select('match', 2)).status, Status.Completed);
        assert.strictEqual((await storage.select('match', 3)).status, Status.Completed);
    });

    it('should keep the final ready when the consolation final is completed first', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: { consolationFinal: true },
        });

        await manager.update.match({
            id: 0, // First match of round 1
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 12 },
        });

        await manager.update.match({
            id: 1, // Second match of round 1
            opponent1: { score: 13 },
            opponent2: { score: 16, result: 'win' },
        });

        await manager.update.match({
            id: 3, // Consolation final
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 9 },
        });

        assert.strictEqual((await storage.select('match', 2)).status, Status.Ready);
        assert.strictEqual((await storage.select('match', 3)).status, Status.Completed);

        await manager.update.match({
            id: 2, // Final
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 9 },
        });

        assert.strictEqual((await storage.select('match', 2)).status, Status.Completed);
        assert.strictEqual((await storage.select('match', 3)).status, Status.Completed);
    });

    it('should keep a completed final editable', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
        });

        await manager.update.match({
            id: 0,
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 12 },
        });

        await manager.update.match({
            id: 1,
            opponent1: { score: 13 },
            opponent2: { score: 16, result: 'win' },
        });

        await manager.update.match({
            id: 2,
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 9 },
        });

        let final = await storage.select('match', 2);
        assert.strictEqual(final.status, Status.Completed);
        assert.strictEqual(await manager.get.currentStage(0), null);
        assert.strictEqual(await manager.get.currentRound(0), null);
        assert.deepEqual(await manager.get.currentMatches(0), []);

        await manager.update.match({
            id: 2,
            opponent1: { score: 14 },
            opponent2: { score: 16, result: 'win' },
        });

        final = await storage.select('match', 2);
        assert.strictEqual(final.status, Status.Completed);
        assert.strictEqual(final.opponent1.result, 'loss');
        assert.strictEqual(final.opponent2.result, 'win');
        assert.strictEqual((await manager.get.finalStandings(0))[0].id, final.opponent2.id);
    });

    it('should archive previous matches', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: { consolationFinal: true },
        });

        await manager.update.match({
            id: 0, // First match of round 1
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 12 },
        });

        await manager.update.match({
            id: 1, // Second match of round 1
            opponent1: { score: 13 },
            opponent2: { score: 16, result: 'win' },
        });

        await manager.update.match({
            id: 2, // Final
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 9 },
        });

        assert.strictEqual((await storage.select('match', 0)).status, Status.Archived);
        assert.strictEqual((await storage.select('match', 1)).status, Status.Archived);

        await manager.update.match({
            id: 3, // Consolation final
            opponent1: { score: 16, result: 'win' },
            opponent2: { score: 9 },
        });

        assert.strictEqual((await storage.select('match', 2)).status, Status.Completed); // Final
        assert.strictEqual((await storage.select('match', 3)).status, Status.Completed); // Consolation final
    });
});

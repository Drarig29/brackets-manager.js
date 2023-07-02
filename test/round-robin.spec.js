const chai = require('chai');
chai.use(require('chai-as-promised'));

const assert = chai.assert;
const { BracketsManager } = require('../dist');
const { JsonDatabase } = require('brackets-json-db');
const { Status } = require('brackets-model');

const storage = new JsonDatabase();
const manager = new BracketsManager(storage);

describe('Create a round-robin stage', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should create a round-robin stage', async () => {
        const example = {
            name: 'Example',
            tournamentId: 0,
            type: 'round_robin',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: { groupCount: 2 },
        };

        await manager.create.stage(example);

        const stage = await storage.select('stage', 0);
        assert.strictEqual(stage.name, example.name);
        assert.strictEqual(stage.type, example.type);

        assert.strictEqual((await storage.select('group')).length, 2);
        assert.strictEqual((await storage.select('round')).length, 6);
        assert.strictEqual((await storage.select('match')).length, 12);
    });

    it('should create a round-robin stage with a manual seeding', async () => {
        const example = {
            name: 'Example',
            tournamentId: 0,
            type: 'round_robin',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: {
                groupCount: 2,
                manualOrdering: [
                    [1, 4, 6, 7],
                    [2, 3, 5, 8],
                ],
            },
        };

        await manager.create.stage(example);

        for (let groupIndex = 0; groupIndex < 2; groupIndex++) {
            const matches = await storage.select('match', { group_id: groupIndex });
            const participants = [
                matches[0].opponent1.position,
                matches[1].opponent2.position,
                matches[1].opponent1.position,
                matches[0].opponent2.position,
            ];

            assert.deepStrictEqual(participants, example.settings.manualOrdering[groupIndex]);
        }
    });

    it('should throw if manual ordering has invalid counts', async () => {
        await assert.isRejected(manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'round_robin',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: {
                groupCount: 2,
                manualOrdering: [
                    [1, 4, 6, 7],
                ],
            },
        }), 'Group count in the manual ordering does not correspond to the given group count.');

        await assert.isRejected(manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'round_robin',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: {
                groupCount: 2,
                manualOrdering: [
                    [1, 4],
                    [2, 3],
                ],
            },
        }), 'Not enough seeds in at least one group of the manual ordering.');
    });

    it('should create a round-robin stage without BYE vs. BYE matches', async () => {
        const example = {
            name: 'Example',
            tournamentId: 0,
            type: 'round_robin',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', null,
                null, null,
            ],
            settings: { groupCount: 2 },
        };

        await manager.create.stage(example);

        // One match must be missing.
        assert.strictEqual((await storage.select('match')).length, 11);
    });

    it('should create a round-robin stage with to be determined participants', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'round_robin',
            settings: {
                groupCount: 4,
                size: 16,
            },
        });

        assert.strictEqual((await storage.select('group')).length, 4);
        assert.strictEqual((await storage.select('round')).length, 4 * 3);
        assert.strictEqual((await storage.select('match')).length, 4 * 3 * 2);
    });

    it('should create a round-robin stage with effort balanced', async () => {
        await manager.create.stage({
            name: 'Example with effort balanced',
            tournamentId: 0,
            type: 'round_robin',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: {
                groupCount: 2,
                seedOrdering: ['groups.seed_optimized'],
            },
        });

        assert.strictEqual((await storage.select('match', 0)).opponent1.id, 0);
        assert.strictEqual((await storage.select('match', 0)).opponent2.id, 7);
    });

    it('should throw if no group count given', async () => {
        await assert.isRejected(manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'round_robin',
        }), 'You must specify a group count for round-robin stages.');
    });

    it('should throw if the group count is not strictly positive', async () => {
        await assert.isRejected(manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'round_robin',
            settings: {
                groupCount: 0,
                size: 4,
                seedOrdering: ['groups.seed_optimized'],
            },
        }), 'You must provide a strictly positive group count.');
    });
});

describe('Update scores in a round-robin stage', () => {

    before(async () => {
        storage.reset();
        await manager.create.stage({
            name: 'Example scores',
            tournamentId: 0,
            type: 'round_robin',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
            ],
            settings: { groupCount: 1 },
        });
    });

    it('should set two forfeits for the match', async () => {
        await manager.update.match({
            id: 0,
            opponent1: { forfeit: true },
            opponent2: { forfeit: true },
        });

        const after = await storage.select('match', 0);
        assert.strictEqual(after.status, Status.Completed);
        assert.strictEqual(after.opponent1.forfeit, true);
        assert.strictEqual(after.opponent2.forfeit, true);
        assert.strictEqual(after.opponent1.result, undefined);
        assert.strictEqual(after.opponent2.result, undefined);
    });

    describe('Test with example use-case', () => {
        // Example taken from here:
        // https://organizer.toornament.com/tournaments/3359823657332629504/stages/3359826493568360448/groups/3359826494507884609/result

        before(async () => {
            storage.reset();
            await manager.create.stage({
                name: 'Example scores',
                tournamentId: 0,
                type: 'round_robin',
                seeding: [
                    'POCEBLO', 'twitch.tv/mrs_fly',
                    'Ballec Squad', 'AQUELLEHEURE?!',
                ],
                settings: { groupCount: 1 },
            });
        });

        it('should set all the scores', async () => {
            await manager.update.match({
                id: 0,
                opponent1: { score: 16, result: 'win' }, // POCEBLO
                opponent2: { score: 9 }, // AQUELLEHEURE?!
            });

            await manager.update.match({
                id: 1,
                opponent1: { score: 3 }, // Ballec Squad
                opponent2: { score: 16, result: 'win' }, // twitch.tv/mrs_fly
            });

            await manager.update.match({
                id: 2,
                opponent1: { score: 16, result: 'win' }, // twitch.tv/mrs_fly
                opponent2: { score: 0 }, // AQUELLEHEURE?!
            });

            await manager.update.match({
                id: 3,
                opponent1: { score: 16, result: 'win' }, // POCEBLO
                opponent2: { score: 2 }, // Ballec Squad
            });

            await manager.update.match({
                id: 4,
                opponent1: { score: 16, result: 'win' }, // Ballec Squad
                opponent2: { score: 12 }, // AQUELLEHEURE?!
            });

            await manager.update.match({
                id: 5,
                opponent1: { score: 4 }, // twitch.tv/mrs_fly
                opponent2: { score: 16, result: 'win' }, // POCEBLO
            });
        });
    });
});

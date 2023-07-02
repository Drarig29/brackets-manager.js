const chai = require('chai');
chai.use(require('chai-as-promised'));

const assert = chai.assert;
const { BracketsManager } = require('../dist');
const { JsonDatabase } = require('brackets-json-db');

const storage = new JsonDatabase();
const manager = new BracketsManager(storage);

describe('Delete stage', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should delete a stage and all its linked data', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
            ],
            settings: { matchesChildCount: 2 },
        });

        await manager.delete.stage(0);

        const stages = await storage.select('stage');
        const groups = await storage.select('group');
        const rounds = await storage.select('round');
        const matches = await storage.select('match');
        const games = await manager.get.matchGames(matches);

        assert.strictEqual(stages.length, 0);
        assert.strictEqual(groups.length, 0);
        assert.strictEqual(rounds.length, 0);
        assert.strictEqual(matches.length, 0);
        assert.strictEqual(games.length, 0);
    });

    it('should delete one stage and only its linked data', async () => {
        await manager.create.stage({
            name: 'Example 1',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
            ],
            settings: { matchesChildCount: 2 },
        });

        await manager.create.stage({
            name: 'Example 2',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
            ],
            settings: { matchesChildCount: 2 },
        });

        await manager.delete.stage(0);

        const stages = await storage.select('stage');
        const groups = await storage.select('group');
        const rounds = await storage.select('round');
        const matches = await storage.select('match');
        const games = await manager.get.matchGames(matches);

        assert.strictEqual(stages.length, 1);
        assert.strictEqual(groups.length, 1);
        assert.strictEqual(rounds.length, 2);
        assert.strictEqual(matches.length, 3);
        assert.strictEqual(games.length, 6);

        // Remaining data
        assert.strictEqual(stages[0].id, 1);
        assert.strictEqual(groups[0].id, 1);
        assert.strictEqual(rounds[0].id, 2);
        assert.strictEqual(matches[0].id, 3);
        assert.strictEqual(games[0].id, 6);
    });

    it('should delete all stages of the tournament', async () => {
        await manager.create.stage({
            name: 'Example 1',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
            ],
            settings: { matchesChildCount: 2 },
        });

        await manager.create.stage({
            name: 'Example 2',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
            ],
            settings: { matchesChildCount: 2 },
        });

        await manager.delete.tournament(0);

        const stages = await storage.select('stage');
        const groups = await storage.select('group');
        const rounds = await storage.select('round');
        const matches = await storage.select('match');
        const games = await manager.get.matchGames(matches);

        assert.strictEqual(stages.length, 0);
        assert.strictEqual(groups.length, 0);
        assert.strictEqual(rounds.length, 0);
        assert.strictEqual(matches.length, 0);
        assert.strictEqual(games.length, 0);
    });
});

const chai = require('chai');
chai.use(require("chai-as-promised"));

const assert = chai.assert;
const { BracketsManager } = require('../dist');
const { storage } = require('../dist/storage/json');

const manager = new BracketsManager(storage);

describe('Special cases', () => {
    it('should create a stage and add participants ids in seeding', async () => {
        storage.reset();

        const teams = [
            "Team 1", "Team 2",
            "Team 3", "Team 4",
            "Team 5", "Team 6",
            "Team 7", "Team 8"
        ];
        
        const participants = teams.map(name => ({
            tournament_id: 0,
            name,
        }));

        // Simulation of external database filling for participants.
        storage.insert('participant', participants);

        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            size: 8,
        });

        // Update seeding with already existing ids.
        await manager.update.seeding(0, [0, 1, 2, 3, 4, 5, 6, 7]);

        assert.equal((await storage.select('match', 0)).opponent1.id, 0);
    });
});

describe('Update match child count', () => {
    beforeEach(async () => {
        storage.reset();

        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: { seedOrdering: ['natural'], matchesChildCount: 1 },
        });
    });

    it('should change match child count at match level', async () => {
        await manager.update.matchChildCount('match', 0, 3);
        assert.equal((await storage.select('match_game')).length, 6 + 3);
    });

    it('should change match child count at round level', async () => {
        await manager.update.matchChildCount('round', 2, 3); // Round of id 2 in Bo3
        assert.equal((await storage.select('match_game')).length, 6 + 3);

        await manager.update.matchChildCount('round', 1, 2); // Round of id 1 in Bo2
        assert.equal((await storage.select('match_game')).length, 4 + 4 + 3);

        await manager.update.matchChildCount('round', 0, 0); // Round of id 0 in Bo0 (normal matches without games)
        assert.equal((await storage.select('match_game')).length, 0 + 4 + 3);
    });

    it('should change match child count at group level', async () => {
        await manager.update.matchChildCount('group', 0, 4);
        assert.equal((await storage.select('match_game')).length, 7 * 4);

        await manager.update.matchChildCount('group', 0, 2);
        assert.equal((await storage.select('match_game')).length, 7 * 2);
    });

    it('should change match child count at stage level', async () => {
        await manager.update.matchChildCount('stage', 0, 4);
        assert.equal((await storage.select('match_game')).length, 7 * 4);

        await manager.update.matchChildCount('stage', 0, 2);
        assert.equal((await storage.select('match_game')).length, 7 * 2);
    });
});

describe('Seeding and ordering in elimination', () => {
    before(async () => {
        storage.reset();

        await manager.create({
            name: 'Amateur',
            tournamentId: 0,
            type: 'double_elimination',
            size: 16,
            settings: {
                seedOrdering: ['inner_outer', 'reverse', 'pair_flip', 'half_shift', 'reverse'],
            },
        });
    });

    it('should have the good orderings everywhere', async () => {
        let match = await storage.select('match', 0);
        assert.equal(match.opponent1.position, 1);
        assert.equal(match.opponent2.position, 16);

        match = await storage.select('match', 15);
        assert.equal(match.opponent1.position, 8);
        assert.equal(match.opponent2.position, 7);

        match = await storage.select('match', 19);
        assert.equal(match.opponent1.position, 2);

        match = await storage.select('match', 20);
        assert.equal(match.opponent1.position, 1);

        match = await storage.select('match', 25);
        assert.equal(match.opponent1.position, 2);

        match = await storage.select('match', 28);
        assert.equal(match.opponent1.position, 1);
    });

    it('should update the orderings in rounds', async () => {
        await manager.update.roundOrdering(0, 'pair_flip');
        let match = await storage.select('match', 0);
        assert.equal(match.opponent1.position, 2);
        assert.equal(match.opponent2.position, 1);

        await manager.update.roundOrdering(5, 'reverse');
        match = await storage.select('match', 19);
        assert.equal(match.opponent1.position, 4);
        match = await storage.select('match', 20);
        assert.equal(match.opponent1.position, 3);
    });

    it('should throw if round does not support ordering', async () => {
        await assert.isRejected(manager.update.roundOrdering(6, 'natural'), 'This round does not support ordering.');
    });

    it('should throw if at least one match is running or completed', async () => {
        await manager.update.match({
            id: 0,
            opponent1: { score: 1 },
        });

        await assert.isRejected(manager.update.roundOrdering(0, 'natural'), 'At least one match has started or is completed.');

        await manager.update.match({
            id: 0,
            opponent1: { result: 'win' },
        });

        await assert.isRejected(manager.update.roundOrdering(0, 'natural'), 'At least one match has started or is completed.');
    });
});
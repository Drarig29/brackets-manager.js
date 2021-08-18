const chai = require('chai');
chai.use(require('chai-as-promised'));

const assert = chai.assert;
const { BracketsManager, JsonDatabase } = require('../dist');

const storage = new JsonDatabase();
const manager = new BracketsManager(storage);

describe('Find previous and next matches', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should find previous matches', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
        });

        const beforeFirst = await manager.find.previousMatches(0);
        assert.strictEqual(beforeFirst.length, 0);

        const beforeSemi1 = await manager.find.previousMatches(4);
        assert.strictEqual(beforeSemi1.length, 2);
        assert.strictEqual(beforeSemi1[0].id, 0);
        assert.strictEqual(beforeSemi1[1].id, 1);
        
        const beforeSemi2 = await manager.find.previousMatches(5);
        assert.strictEqual(beforeSemi2.length, 2);
        assert.strictEqual(beforeSemi2[0].id, 2);
        assert.strictEqual(beforeSemi2[1].id, 3);
        
        const beforeFinal = await manager.find.previousMatches(6);
        assert.strictEqual(beforeFinal.length, 2);
        assert.strictEqual(beforeFinal[0].id, 4);
        assert.strictEqual(beforeFinal[1].id, 5);
    });

    it('should find next matches', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
        });

        const afterFirst = await manager.find.nextMatches(0);
        assert.strictEqual(afterFirst.length, 1);
        assert.strictEqual(afterFirst[0].id, 4);
        
        const afterSemi1 = await manager.find.nextMatches(4);
        assert.strictEqual(afterSemi1.length, 1);
        assert.strictEqual(afterSemi1[0].id, 6);
        
        const afterFinal = await manager.find.nextMatches(6);
        assert.strictEqual(afterFinal.length, 0);
    });
});

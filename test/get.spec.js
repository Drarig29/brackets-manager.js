const chai = require('chai');
chai.use(require('chai-as-promised'));

const assert = chai.assert;
const { BracketsManager, JsonDatabase } = require('../dist');

const storage = new JsonDatabase();
const manager = new BracketsManager(storage);

describe('Final Standings', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should get the final standings for a single elimination stage with consolation final', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
            settings: { consolationFinal: true },
        });

        for (let i = 0; i < 8; i++) {
            await manager.update.match({
                id: i,
                ...i % 2 === 0 ? { opponent1: { result: 'win' } } : { opponent2: { result: 'win' } },
            });
        }

        const finalStandings = await manager.get.finalStandings(0);

        assert.deepEqual(finalStandings, [
            { id: 0, name: 'Team 1', rank: 1 },
            { id: 5, name: 'Team 6', rank: 2 },

            // The consolation final has inverted those ones (rank 3).
            { id: 1, name: 'Team 2', rank: 3 },
            { id: 4, name: 'Team 5', rank: 3 },

            { id: 7, name: 'Team 8', rank: 4 },
            { id: 3, name: 'Team 4', rank: 4 },
            { id: 6, name: 'Team 7', rank: 4 },
            { id: 2, name: 'Team 3', rank: 4 },
        ]);
    });

    it('should get the final standings for a single elimination stage without consolation final', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
            settings: { consolationFinal: false },
        });

        for (let i = 0; i < 7; i++) {
            await manager.update.match({
                id: i,
                ...i % 2 === 0 ? { opponent1: { result: 'win' } } : { opponent2: { result: 'win' } },
            });
        }

        const finalStandings = await manager.get.finalStandings(0);

        assert.deepEqual(finalStandings, [
            { id: 0, name: 'Team 1', rank: 1 },
            { id: 5, name: 'Team 6', rank: 2 },

            // Here, they are not inverted (rank 3).
            { id: 4, name: 'Team 5', rank: 3 },
            { id: 1, name: 'Team 2', rank: 3 },

            { id: 7, name: 'Team 8', rank: 4 },
            { id: 3, name: 'Team 4', rank: 4 },
            { id: 6, name: 'Team 7', rank: 4 },
            { id: 2, name: 'Team 3', rank: 4 },
        ]);
    });

    it('should get the final standings for a double elimination stage with a grand final', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
            settings: { grandFinal: 'double' },
        });

        for (let i = 0; i < 15; i++) {
            await manager.update.match({
                id: i,
                ...i % 2 === 0 ? { opponent1: { result: 'win' } } : { opponent2: { result: 'win' } },
            });
        }

        const finalStandings = await manager.get.finalStandings(0);

        assert.deepEqual(finalStandings, [
            { id: 0, name: 'Team 1', rank: 1 },
            { id: 5, name: 'Team 6', rank: 2 },
            { id: 4, name: 'Team 5', rank: 3 },
            { id: 3, name: 'Team 4', rank: 4 },
            { id: 1, name: 'Team 2', rank: 5 },
            { id: 6, name: 'Team 7', rank: 5 },
            { id: 7, name: 'Team 8', rank: 6 },
            { id: 2, name: 'Team 3', rank: 6 },
        ]);
    });

    it('should get the final standings for a double elimination stage without a grand final', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
            settings: { grandFinal: 'none' },
        });

        for (let i = 0; i < 13; i++) {
            await manager.update.match({
                id: i,
                // The parity is reversed here, just to have different results.
                ...i % 2 === 1 ? { opponent1: { result: 'win' } } : { opponent2: { result: 'win' } },
            });
        }

        const finalStandings = await manager.get.finalStandings(0);

        assert.deepEqual(finalStandings, [
            { id: 6, name: 'Team 7', rank: 1 },
            { id: 2, name: 'Team 3', rank: 2 },
            { id: 3, name: 'Team 4', rank: 3 },
            { id: 5, name: 'Team 6', rank: 4 },
            { id: 0, name: 'Team 1', rank: 5 },
            { id: 7, name: 'Team 8', rank: 5 },
            { id: 4, name: 'Team 5', rank: 6 },
            { id: 1, name: 'Team 2', rank: 6 },
        ]);
    });
});
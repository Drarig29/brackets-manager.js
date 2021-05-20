const chai = require('chai');
chai.use(require('chai-as-promised'));

const { BracketsManager } = require('../dist');
const { storage } = require('../dist/storage/json');

const manager = new BracketsManager(storage);

describe('Data example for the viewer', () => {
    beforeEach(() => {
        storage.reset();
    });

    it('should create a double elimination dataset', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                null, 'Team 6', 'Team 7', 'Team 8',
                'Team 9', 'Team 10', 'Team 11', 'Team 12',
                'Team 13', 'Team 14', 'Team 15', 'Team 16'
            ],
            settings: {
                size: 16,
                seedOrdering: ['natural'],
                grandFinal: 'double'
            },
        });

        // TODO: https://github.com/Drarig29/brackets-manager.js/issues/59

        await manager.update.match({
            id: 0,
            opponent1: {
                score: 16,
                result: 'win',
            },
            opponent2: {
                score: 12,
            },
        });

        await manager.update.match({
            id: 1,
            opponent1: {
                score: 8,
            },
            opponent2: {
                score: 4,
            },
        });
    });
});
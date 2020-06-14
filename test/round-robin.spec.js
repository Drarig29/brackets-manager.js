const chai = require('chai');
chai.use(require("chai-as-promised"));

const assert = chai.assert;
const { BracketsManager } = require('../dist');
const { storage } = require('../dist/storage/json');

const manager = new BracketsManager(storage);

describe('Create a round-robin stage', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should create a round-robin stage', async () => {
        const example = {
            name: 'Example',
            type: 'round_robin',
            participants: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: { groupCount: 2 },
        };

        await manager.createStage(0, example);

        const stage = await storage.select('stage', 0);
        assert.equal(stage.name, example.name);
        assert.equal(stage.type, example.type);

        assert.equal((await storage.select('group')).length, 2);
        assert.equal((await storage.select('round')).length, 6);
        assert.equal((await storage.select('match')).length, 12);
    });

    it('should create a round-robin stage with effort balanced', async () => {
        const example = {
            name: 'Example with effort balanced',
            type: 'round_robin',
            participants: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: {
                groupCount: 2,
                seedOrdering: ['groups.snake'],
            },
        };

        await manager.createStage(0, example);

        assert.equal((await storage.select('match', 0)).opponent1.id, 0);
        assert.equal((await storage.select('match', 0)).opponent2.id, 7);
    });

    it('should throw if no group count given', async () => {
        await assert.isRejected(manager.createStage(0, { type: 'round_robin' }), 'You must specify a group count for round-robin stages.');
    });
});

// Example taken from here:
// https://organizer.toornament.com/tournaments/3359823657332629504/stages/3359826493568360448/groups/3359826494507884609/result

describe('Update scores in a round-robin stage', () => {
    const example = {
        name: 'Example scores',
        type: 'round_robin',
        participants: [
            'POCEBLO', 'twitch.tv/mrs_fly',
            'Ballec Squad', 'AQUELLEHEURE?!',
        ],
        settings: { groupCount: 1 },
    };

    before(async () => {
        storage.reset();
        await manager.createStage(0, example);
    });

    it('should set all the scores', async () => {
        await manager.updateMatch({
            id: 0,
            opponent1: { score: 16, result: "win" }, // POCEBLO
            opponent2: { score: 9 }, // AQUELLEHEURE?!
        });

        await manager.updateMatch({
            id: 1,
            opponent1: { score: 3 }, // Ballec Squad
            opponent2: { score: 16, result: "win" }, // twitch.tv/mrs_fly
        });

        await manager.updateMatch({
            id: 2,
            opponent1: { score: 16, result: "win" }, // twitch.tv/mrs_fly
            opponent2: { score: 0 }, // AQUELLEHEURE?!
        });

        await manager.updateMatch({
            id: 3,
            opponent1: { score: 16, result: "win" }, // POCEBLO
            opponent2: { score: 2 }, // Ballec Squad
        });

        await manager.updateMatch({
            id: 4,
            opponent1: { score: 16, result: "win" }, // Ballec Squad
            opponent2: { score: 12 }, // AQUELLEHEURE?!
        });

        await manager.updateMatch({
            id: 5,
            opponent1: { score: 4 }, // twitch.tv/mrs_fly
            opponent2: { score: 16, result: "win" }, // POCEBLO
        });
    });

    it('should give an appropriate ranking', async () => {
        const ranking = await manager.getRanking(0);
        assert.deepEqual(ranking, example.participants)
    });
});
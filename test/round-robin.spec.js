const { createStage } = require('../dist/create');
const { updateMatch } = require('../dist/update');
const { getRanking } = require('../dist/results');
const { db } = require('../dist/database');
const assert = require('chai').assert;

describe('Create a round-robin stage', () => {
    beforeEach(() => {
        db.reset();
    });

    it('should create a round-robin stage', () => {
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

        createStage(example);

        const stage = db.select('stage', 0);
        assert.equal(stage.name, example.name);
        assert.equal(stage.type, example.type);

        assert.equal(db.all('group').length, 2);
        assert.equal(db.all('round').length, 6);
        assert.equal(db.all('match').length, 12);
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

    before(() => {
        db.reset();
        createStage(example);
    });

    it('should set all the scores', () => {
        updateMatch({
            id: 0,
            opponent1: { score: 16, result: "win" }, // POCEBLO
            opponent2: { score: 9 }, // AQUELLEHEURE?!
        });

        updateMatch({
            id: 1,
            opponent1: { score: 3 }, // Ballec Squad
            opponent2: { score: 16, result: "win" }, // twitch.tv/mrs_fly
        });

        updateMatch({
            id: 2,
            opponent1: { score: 16, result: "win" }, // twitch.tv/mrs_fly
            opponent2: { score: 0 }, // AQUELLEHEURE?!
        });

        updateMatch({
            id: 3,
            opponent1: { score: 16, result: "win" }, // POCEBLO
            opponent2: { score: 2 }, // Ballec Squad
        });

        updateMatch({
            id: 4,
            opponent1: { score: 16, result: "win" }, // Ballec Squad
            opponent2: { score: 12 }, // AQUELLEHEURE?!
        });

        updateMatch({
            id: 5,
            opponent1: { score: 4 }, // twitch.tv/mrs_fly
            opponent2: { score: 16, result: "win" }, // POCEBLO
        });
    });

    it('should give an appropriate ranking', () => {
        const ranking = getRanking(0);
        assert.deepEqual(ranking, example.participants)
    });
});
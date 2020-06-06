const { createStage } = require('../dist/create');
const { updateMatch } = require('../dist/update');
const { db } = require('../dist/database');
const assert = require('chai').assert;

const example = {
    name: 'Amateur',
    minorOrdering: ['reverse', 'pair_flip', 'reverse', 'natural'],
    type: 'double_elimination',
    teams: [
        'Team 1', 'Team 2',
        'Team 3', 'Team 4',
        'Team 5', 'Team 6',
        'Team 7', 'Team 8',
        'Team 9', 'Team 10',
        'Team 11', 'Team 12',
        'Team 13', 'Team 14',
        'Team 15', 'Team 16',
    ],
};

describe('Create double elimination stage', () => {
    beforeEach(() => {
        db.reset();
    });

    it('should create a double elimination stage', () => {
        createStage(example);

        const stage = db.select('stage', 0);
        assert.equal(stage.name, example.name);
        assert.equal(stage.type, example.type);

        assert.equal(db.all('group').length, 3);
        assert.equal(db.all('round').length, 4 + 6 + 1);
        assert.equal(db.all('match').length, 30);
    });

    it('should propagate BYEs through the brackets', () => {
        const withByes = {
            name: 'Example with BYEs',
            type: 'double_elimination',
            teams: [
                'Team 1', null,
                null, null,
            ],
        };

        createStage(withByes);

        assert.equal(db.select('match', 2).team1.name, withByes.teams[0]);
        assert.equal(db.select('match', 2).team2, null);

        assert.equal(db.select('match', 3).team1, null);
        assert.equal(db.select('match', 3).team2, null);

        assert.equal(db.select('match', 4).team1, null);
        assert.equal(db.select('match', 4).team2, null);

        assert.equal(db.select('match', 5).team1.name, withByes.teams[0]);
        assert.equal(db.select('match', 5).team2, null);
    });
});

describe('Update matches', () => {
    before(() => {
        db.reset();
        createStage(example);
    });

    it('should start a match', () => {
        const before = db.select('match', 0);
        assert.equal(before.status, 'pending');

        updateMatch({
            id: 0,
            status: 'running',
        });

        const after = db.select('match', 0);
        assert.equal(after.status, 'running');
    });

    it('should update the scores for a match', () => {
        const before = db.select('match', 0);
        assert.equal(before.team1.score, undefined);

        updateMatch({
            id: 0,
            team1: { score: 2 },
            team2: { score: 1 },
        });

        const after = db.select('match', 0);
        assert.equal(after.team1.score, 2);

        // Name should stay. It shouldn't be overwritten.
        assert.equal(after.team1.name, example.teams[0]);
    });

    it('should simply end the match here', () => {
        updateMatch({
            id: 0,
            status: 'running',
        });

        const before = db.select('match', 0);
        assert.equal(before.status, 'running');

        updateMatch({
            id: 0,
            status: 'completed',
        });

        const after = db.select('match', 0);
        assert.equal(after.status, 'completed');
    });

    it('should end the match by only setting the winner', () => {
        const before = db.select('match', 0);
        assert.equal(before.team1.result, undefined);

        updateMatch({
            id: 0,
            team1: { result: 'win' },
        });

        const after = db.select('match', 0);
        assert.equal(after.status, 'completed');
        assert.equal(after.team1.result, 'win');
        assert.equal(after.team2.result, 'loss');
    });

    it('should end the match by only setting a forfeit', () => {
        const before = db.select('match', 2);
        assert.equal(before.team1.result, undefined);

        updateMatch({
            id: 2,
            team1: { forfeit: true },
        });

        const after = db.select('match', 2);
        assert.equal(after.status, 'completed');
        assert.equal(after.team1.forfeit, true);
        assert.equal(after.team1.result, null);
        assert.equal(after.team2.result, 'win');
    });

    it('should end the match by setting winner and loser', () => {
        updateMatch({
            id: 0,
            status: 'running',
        });

        updateMatch({
            id: 0,
            team1: { result: 'win' },
            team2: { result: 'loss' },
        });

        const after = db.select('match', 0);
        assert.equal(after.status, 'completed');
        assert.equal(after.team1.result, 'win');
        assert.equal(after.team2.result, 'loss');
    });

    it('should fail if two winners', () => {
        assert.throws(() => updateMatch({
            id: 3,
            team1: { result: 'win' },
            team2: { result: 'win' },
        }));

        assert.throws(() => updateMatch({
            id: 3,
            team1: { result: 'loss' },
            team2: { result: 'loss' },
        }));
    });
});

describe('Winner bracket', () => {
    before(() => {
        db.reset();
        createStage(example);
    });

    it('should end a match (round 1) and determine one team in next (round 2)', () => {
        const before = db.select('match', 8); // First match of WB round 2
        assert.equal(before.team2.name, null);

        updateMatch({
            id: 1, // Second match of WB round 1
            team1: {
                score: 13
            },
            team2: {
                score: 16,
                result: 'win',
            },
        });

        assert.equal(
            db.select('match', 8).team2.name, // Determined opponent for round 2
            db.select('match', 1).team2.name, // Winner of round 1
        );
    });
});
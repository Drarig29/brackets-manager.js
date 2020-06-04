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

describe('Create tournament', () => {
    it('should create a tournament', () => {
        db.reset();
        createStage(example);

        const stage = db.select('stage', 0);
        assert.equal(stage.name, example.name);
        assert.equal(stage.type, example.type);

        assert.equal(db.all('group').length, 3);
        assert.equal(db.all('round').length, 4 + 6 + 1);
        assert.equal(db.all('match').length, 30);
    });
});

describe('Update matches', () => {
    it('should update the status of a match', () => {
        assert.equal(db.select('match', 0).status, 'pending');
        updateMatch({
            id: 0,
            status: 'running',
        });
        assert.equal(db.select('match', 0).status, 'running');
    });

    it('should update the scores for a match', () => {
        assert.equal(db.select('match', 0).team1.score, undefined);
        updateMatch({
            id: 0,
            team1: { score: 2 },
            team2: { score: 1 },
        });
        
        // Name should stay. It shouldn't be overwritten.
        assert.equal(db.select('match', 0).team1.name, example.teams[0]);
        assert.equal(db.select('match', 0).team1.score, 2);
    });
});
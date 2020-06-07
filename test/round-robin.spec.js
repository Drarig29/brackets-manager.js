const { createStage } = require('../dist/create');
const { db } = require('../dist/database');
const assert = require('chai').assert;

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

describe('Create a round-robin stage', () => {
    beforeEach(() => {
        db.reset();
    });

    it('should create a round-robin stage', () => {
        createStage(example);

        const stage = db.select('stage', 0);
        assert.equal(stage.name, example.name);
        assert.equal(stage.type, example.type);

        assert.equal(db.all('group').length, 2);
        assert.equal(db.all('round').length, 6);
        assert.equal(db.all('match').length, 12);
    });

    // TODO: add a test with BYEs
    // TODO: add a test with tie-breakers
});
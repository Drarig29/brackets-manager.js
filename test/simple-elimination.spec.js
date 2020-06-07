const { createStage } = require('../dist/create');
const { db } = require('../dist/database');
const assert = require('chai').assert;

const example = {
    name: 'Example',
    type: 'single_elimination',
    participants: [
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

describe('Create single elimination stage', () => {
    beforeEach(() => {
        db.reset();
    });

    it('should create a single elimination stage', () => {
        createStage(example);

        const stage = db.select('stage', 0);
        assert.equal(stage.name, example.name);
        assert.equal(stage.type, example.type);

        assert.equal(db.all('group').length, 1);
        assert.equal(db.all('round').length, 4);
        assert.equal(db.all('match').length, 15);
    });

    it('should create a single elimination stage with BYEs', () => {
        const withByes = {
            name: 'Example with BYEs',
            type: 'single_elimination',
            participants: [
                'Team 1', null,
                'Team 3', 'Team 4',
                null, null,
                'Team 7', 'Team 8',
            ],
        };

        createStage(withByes);

        assert.equal(db.select('match', 4).team1.name, withByes.participants[0]); // Determined because of opponent's BYE.
        assert.equal(db.select('match', 4).team2.name, null); // To be determined.
        assert.equal(db.select('match', 5).team1, null); // BYE propagated.
        assert.equal(db.select('match', 5).team2.name, null); // To be determined.
    });
});
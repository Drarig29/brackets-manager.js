const { createStage } = require('../dist/create');
const { db } = require('../dist/database');
const assert = require('chai').assert;

describe('Create single elimination stage', () => {
    beforeEach(() => {
        db.reset();
    });

    it('should create a single elimination stage', () => {
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

        createStage(example);

        const stage = db.select('stage', 0);
        assert.equal(stage.name, example.name);
        assert.equal(stage.type, example.type);

        assert.equal(db.all('group').length, 1);
        assert.equal(db.all('round').length, 4);
        assert.equal(db.all('match').length, 15);
    });

    it('should create a single elimination stage with BYEs', () => {
        const example = {
            name: 'Example with BYEs',
            type: 'single_elimination',
            participants: [
                'Team 1', null,
                'Team 3', 'Team 4',
                null, null,
                'Team 7', 'Team 8',
            ],
        };

        createStage(example);

        assert.equal(db.select('match', 4).team1.name, example.participants[0]); // Determined because of opponent's BYE.
        assert.equal(db.select('match', 4).team2.name, null); // To be determined.
        assert.equal(db.select('match', 5).team1, null); // BYE propagated.
        assert.equal(db.select('match', 5).team2.name, null); // To be determined.
    });

    it('should create a single elimination stage with consolation final', () => {
        const example = {
            name: 'Example with consolation final',
            type: 'single_elimination',
            participants: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: { consolationFinal: true },
        };

        createStage(example);

        const stage = db.select('stage', 0);
        assert.equal(stage.name, example.name);
        assert.equal(stage.type, example.type);

        assert.equal(db.all('group').length, 2);
        assert.equal(db.all('round').length, 4);
        assert.equal(db.all('match').length, 8);
    });

    it('should create a single elimination stage with consolation final and BYEs', () => {
        const example = {
            name: 'Example with consolation final and BYEs',
            type: 'single_elimination',
            participants: [
                null, null,
                null, 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: { consolationFinal: true },
        };

        createStage(example);

        assert.equal(db.select('match', 4).team1, null);
        assert.equal(db.select('match', 4).team2.name, example.participants[3]);

        // Consolation final
        assert.equal(db.select('match', 7).team1, null);
        assert.equal(db.select('match', 7).team2.name, null);
    });
});
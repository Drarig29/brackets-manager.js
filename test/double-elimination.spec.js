const assert = require('chai').assert;
const { BracketsManager } = require('../dist');
const { storage } = require('../dist/storage/json');

const manager = new BracketsManager(storage);

const example = {
    name: 'Amateur',
    type: 'double_elimination',
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
    settings: { seedOrdering: ['natural'] },
};

describe('Create double elimination stage', () => {
    beforeEach(() => {
        storage.reset();
    });

    it('should create a double elimination stage', () => {
        manager.createStage(example);

        const stage = storage.select('stage', 0);
        assert.equal(stage.name, example.name);
        assert.equal(stage.type, example.type);

        assert.equal(storage.select('group').length, 3);
        assert.equal(storage.select('round').length, 4 + 6 + 1);
        assert.equal(storage.select('match').length, 30);
    });

    it('should propagate BYEs through the brackets', () => {
        const withByes = {
            name: 'Example with BYEs',
            type: 'double_elimination',
            participants: [
                'Team 1', null,
                null, null,
            ],
            settings: { seedOrdering: ['natural'] },
        };

        manager.createStage(withByes);

        assert.equal(storage.select('match', 2).opponent1.id, 0);
        assert.equal(storage.select('match', 2).opponent2, null);

        assert.equal(storage.select('match', 3).opponent1, null);
        assert.equal(storage.select('match', 3).opponent2, null);

        assert.equal(storage.select('match', 4).opponent1, null);
        assert.equal(storage.select('match', 4).opponent2, null);

        assert.equal(storage.select('match', 5).opponent1.id, 0);
        assert.equal(storage.select('match', 5).opponent2, null);
    });

    it('should create a tournament with a double grand final', () => {
        const withDoubleGrandFinal = {
            name: 'Example with double grand final',
            type: 'double_elimination',
            participants: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: { grandFinal: 'double', seedOrdering: ['natural'] },
        };

        manager.createStage(withDoubleGrandFinal);

        const stage = storage.select('stage', 0);
        assert.equal(stage.name, withDoubleGrandFinal.name);
        assert.equal(stage.type, withDoubleGrandFinal.type);

        assert.equal(storage.select('group').length, 3);
        assert.equal(storage.select('round').length, 3 + 4 + 2);
        assert.equal(storage.select('match').length, 15);
    });
});

describe('Update matches', () => {
    before(() => {
        storage.reset();
        manager.createStage(example);
    });

    it('should start a match', () => {
        const before = storage.select('match', 0);
        assert.equal(before.status, 'pending');

        manager.updateMatch({
            id: 0,
            status: 'running',
        });

        const after = storage.select('match', 0);
        assert.equal(after.status, 'running');
    });

    it('should update the scores for a match', () => {
        const before = storage.select('match', 0);
        assert.equal(before.opponent1.score, undefined);

        manager.updateMatch({
            id: 0,
            opponent1: { score: 2 },
            opponent2: { score: 1 },
        });

        const after = storage.select('match', 0);
        assert.equal(after.opponent1.score, 2);

        // Name should stay. It shouldn't be overwritten.
        assert.equal(after.opponent1.id, 0);
    });

    it('should simply end the match here', () => {
        manager.updateMatch({
            id: 0,
            status: 'running',
        });

        const before = storage.select('match', 0);
        assert.equal(before.status, 'running');

        // TODO: should test for scores and notify if it's tied.
        // TODO: in a case of a tied match, the admin should be able to set the winner manually or set a forfeit.

        manager.updateMatch({
            id: 0,
            status: 'completed',
        });

        const after = storage.select('match', 0);
        assert.equal(after.status, 'completed');
    });

    it('should end the match by only setting the winner', () => {
        const before = storage.select('match', 0);
        assert.equal(before.opponent1.result, undefined);

        manager.updateMatch({
            id: 0,
            opponent1: { result: 'win' },
        });

        const after = storage.select('match', 0);
        assert.equal(after.status, 'completed');
        assert.equal(after.opponent1.result, 'win');
        assert.equal(after.opponent2.result, 'loss');
    });

    it('should end the match by only setting a forfeit', () => {
        const before = storage.select('match', 2);
        assert.equal(before.opponent1.result, undefined);

        manager.updateMatch({
            id: 2,
            opponent1: { forfeit: true },
        });

        const after = storage.select('match', 2);
        assert.equal(after.status, 'completed');
        assert.equal(after.opponent1.forfeit, true);
        assert.equal(after.opponent1.result, null);
        assert.equal(after.opponent2.result, 'win');
    });

    it('should end the match by setting winner and loser', () => {
        manager.updateMatch({
            id: 0,
            status: 'running',
        });

        manager.updateMatch({
            id: 0,
            opponent1: { result: 'win' },
            opponent2: { result: 'loss' },
        });

        const after = storage.select('match', 0);
        assert.equal(after.status, 'completed');
        assert.equal(after.opponent1.result, 'win');
        assert.equal(after.opponent2.result, 'loss');
    });

    it('should end the match by setting the winner and the scores', () => {
        manager.updateMatch({
            id: 1,
            opponent1: { score: 6 },
            opponent2: { result: 'win', score: 3 },
        });

        const after = storage.select('match', 1);
        assert.equal(after.status, 'completed');

        assert.equal(after.opponent1.result, 'loss');
        assert.equal(after.opponent1.score, 6);

        assert.equal(after.opponent2.result, 'win');
        assert.equal(after.opponent2.score, 3);
    });

    it('should fail if two winners', () => {
        assert.throws(() => manager.updateMatch({
            id: 3,
            opponent1: { result: 'win' },
            opponent2: { result: 'win' },
        }));

        assert.throws(() => manager.updateMatch({
            id: 3,
            opponent1: { result: 'loss' },
            opponent2: { result: 'loss' },
        }));
    });
});

describe('Winner bracket', () => {
    before(() => {
        storage.reset();
        manager.createStage(example);
    });

    it('should end a match (round 1) and determine one team in next (round 2)', () => {
        const before = storage.select('match', 8); // First match of WB round 2
        assert.equal(before.opponent2.id, null);

        manager.updateMatch({
            id: 1, // Second match of WB round 1
            opponent1: {
                score: 13
            },
            opponent2: {
                score: 16,
                result: 'win',
            },
        }, true);

        assert.equal(
            storage.select('match', 8).opponent2.id, // Determined opponent for round 2
            storage.select('match', 1).opponent2.id, // Winner of round 1
        );
    });
});
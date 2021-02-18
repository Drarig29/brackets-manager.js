const chai = require('chai');
chai.use(require('chai-as-promised'));

const assert = chai.assert;
const { BracketsManager, JsonDatabase } = require('../dist');

const storage = new JsonDatabase();
const manager = new BracketsManager(storage);

describe('BYE handling', () => {
    beforeEach(() => {
        storage.reset();
    });

    it('should propagate BYEs through the brackets', async () => {
        await manager.create({
            name: 'Example with BYEs',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', null,
                null, null,
            ],
            settings: { seedOrdering: ['natural'], grandFinal: 'simple' },
        });

        assert.strictEqual((await storage.select('match', 2)).opponent1.id, 0);
        assert.strictEqual((await storage.select('match', 2)).opponent2, null);

        assert.strictEqual((await storage.select('match', 3)).opponent1, null);
        assert.strictEqual((await storage.select('match', 3)).opponent2, null);

        assert.strictEqual((await storage.select('match', 4)).opponent1, null);
        assert.strictEqual((await storage.select('match', 4)).opponent2, null);

        assert.strictEqual((await storage.select('match', 5)).opponent1.id, 0);
        assert.strictEqual((await storage.select('match', 5)).opponent2, null);
    });

    it('should balance BYEs in the seeding', async () => {
        await manager.create({
            name: 'Example with BYEs',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', 'Team 2',
            ],
            settings: {
                seedOrdering: ['natural'],
                balanceByes: true,
                size: 4,
            },
        });

        assert.strictEqual((await storage.select('match', 0)).opponent1.id, 0);
        assert.strictEqual((await storage.select('match', 0)).opponent2, null);

        assert.strictEqual((await storage.select('match', 1)).opponent1.id, 1);
        assert.strictEqual((await storage.select('match', 1)).opponent2, null);
    });
});

describe('Position checks', () => {
    before(async () => {
        storage.reset();

        await manager.create({
            name: 'Example with double grand final',
            tournamentId: 0,
            type: 'double_elimination',
            settings: {
                size: 8,
                grandFinal: 'simple',
                seedOrdering: ['natural'],
            },
        });
    });

    it('should not have a position when we don\'t need the origin of a participant', async () => {
        const matchFromWbRound2 = await storage.select('match', 4);
        assert.strictEqual(matchFromWbRound2.opponent1.position, undefined);
        assert.strictEqual(matchFromWbRound2.opponent2.position, undefined);

        const matchFromLbRound2 = await storage.select('match', 9);
        assert.strictEqual(matchFromLbRound2.opponent2.position, undefined);

        const matchFromGrandFinal = await storage.select('match', 13);
        assert.strictEqual(matchFromGrandFinal.opponent1.position, undefined);
    });

    it('should have a position where we need the origin of a participant', async () => {
        const matchFromWbRound1 = await storage.select('match', 0);
        assert.strictEqual(matchFromWbRound1.opponent1.position, 1);
        assert.strictEqual(matchFromWbRound1.opponent2.position, 2);

        const matchFromLbRound1 = await storage.select('match', 7);
        assert.strictEqual(matchFromLbRound1.opponent1.position, 1);
        assert.strictEqual(matchFromLbRound1.opponent2.position, 2);

        const matchFromLbRound2 = await storage.select('match', 9);
        assert.strictEqual(matchFromLbRound2.opponent1.position, 2);

        const matchFromGrandFinal = await storage.select('match', 13);
        assert.strictEqual(matchFromGrandFinal.opponent2.position, 1);
    });
});

describe('Special cases', () => {
    beforeEach(() => {
        storage.reset();
    });

    it('should create a stage and add participants ids in seeding', async () => {
        const teams = [
            'Team 1', 'Team 2',
            'Team 3', 'Team 4',
            'Team 5', 'Team 6',
            'Team 7', 'Team 8',
        ];

        const participants = teams.map(name => ({
            tournament_id: 0,
            name,
        }));

        // Simulation of external database filling for participants.
        await storage.insert('participant', participants);

        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            settings: { size: 8 },
        });

        // Update seeding with already existing ids.
        await manager.update.seeding(0, [0, 1, 2, 3, 4, 5, 6, 7]);

        assert.strictEqual((await storage.select('match', 0)).opponent1.id, 0);
    });

    it('should throw if the name of the stage is not provided', async () => {
        await assert.isRejected(manager.create({
            tournamentId: 0,
            type: 'single_elimination',
        }), 'You must provide a name for the stage.');
    });

    it('should throw if the tournament id of the stage is not provided', async () => {
        await assert.isRejected(manager.create({
            name: 'Example',
            type: 'single_elimination',
        }), 'You must provide a tournament id for the stage.');
    });

    it('should throw if the participant count of a stage is not a power of two', async () => {
        await assert.isRejected(manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7',
            ],
        }), 'The library only supports a participant count which is a power of two.');

        await assert.isRejected(manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            settings: { size: 3 },
        }), 'The library only supports a participant count which is a power of two.');
    });

    it('should throw if the participant count of a stage is less than two', async () => {
        await assert.isRejected(manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            settings: { size: 0 },
        }), 'Impossible to create an empty stage. If you want an empty seeding, just set the size of the stage.');

        await assert.isRejected(manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            settings: { size: 1 },
        }), 'Impossible to create a stage with less than 2 participants.');
    });
});

describe('Update match child count', () => {
    beforeEach(async () => {
        storage.reset();

        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2',
                'Team 3', 'Team 4',
                'Team 5', 'Team 6',
                'Team 7', 'Team 8',
            ],
            settings: { seedOrdering: ['natural'], matchesChildCount: 1 },
        });
    });

    it('should change match child count at match level', async () => {
        await manager.update.matchChildCount('match', 0, 3);
        assert.strictEqual((await storage.select('match_game')).length, 6 + 3);
    });

    it('should change match child count at round level', async () => {
        await manager.update.matchChildCount('round', 2, 3); // Round of id 2 in Bo3
        assert.strictEqual((await storage.select('match_game')).length, 6 + 3);

        await manager.update.matchChildCount('round', 1, 2); // Round of id 1 in Bo2
        assert.strictEqual((await storage.select('match_game')).length, 4 + 4 + 3);

        await manager.update.matchChildCount('round', 0, 0); // Round of id 0 in Bo0 (normal matches without games)
        assert.strictEqual((await storage.select('match_game')).length, 0 + 4 + 3);
    });

    it('should change match child count at group level', async () => {
        await manager.update.matchChildCount('group', 0, 4);
        assert.strictEqual((await storage.select('match_game')).length, 7 * 4);

        await manager.update.matchChildCount('group', 0, 2);
        assert.strictEqual((await storage.select('match_game')).length, 7 * 2);
    });

    it('should change match child count at stage level', async () => {
        await manager.update.matchChildCount('stage', 0, 4);
        assert.strictEqual((await storage.select('match_game')).length, 7 * 4);

        await manager.update.matchChildCount('stage', 0, 2);
        assert.strictEqual((await storage.select('match_game')).length, 7 * 2);
    });
});

describe('Seeding and ordering in elimination', () => {
    beforeEach(async () => {
        storage.reset();

        await manager.create({
            name: 'Amateur',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
                'Team 9', 'Team 10', 'Team 11', 'Team 12',
                'Team 13', 'Team 14', 'Team 15', 'Team 16',
            ],
            settings: {
                seedOrdering: ['inner_outer', 'reverse', 'pair_flip', 'half_shift', 'reverse'],
            },
        });
    });

    it('should have the good orderings everywhere', async () => {
        const firstRoundMatchWB = await storage.select('match', 0);
        assert.strictEqual(firstRoundMatchWB.opponent1.position, 1);
        assert.strictEqual(firstRoundMatchWB.opponent2.position, 16);

        const firstRoundMatchLB = await storage.select('match', 15);
        assert.strictEqual(firstRoundMatchLB.opponent1.position, 8);
        assert.strictEqual(firstRoundMatchLB.opponent2.position, 7);

        const secondRoundMatchLB = await storage.select('match', 19);
        assert.strictEqual(secondRoundMatchLB.opponent1.position, 2);

        const secondRoundSecondMatchLB = await storage.select('match', 20);
        assert.strictEqual(secondRoundSecondMatchLB.opponent1.position, 1);

        const fourthRoundMatchLB = await storage.select('match', 25);
        assert.strictEqual(fourthRoundMatchLB.opponent1.position, 2);

        const finalRoundMatchLB = await storage.select('match', 28);
        assert.strictEqual(finalRoundMatchLB.opponent1.position, 1);
    });

    it('should update the orderings in rounds', async () => {
        let firstRoundMatchWB = await storage.select('match', 0);

        // Inner outer before changing.
        assert.strictEqual(firstRoundMatchWB.opponent1.position, 1);
        assert.strictEqual(firstRoundMatchWB.opponent2.position, 16);

        await manager.update.roundOrdering(0, 'pair_flip');

        firstRoundMatchWB = await storage.select('match', 0);

        // Should now be pair_flip.
        assert.strictEqual(firstRoundMatchWB.opponent1.position, 2);
        assert.strictEqual(firstRoundMatchWB.opponent2.position, 1);

        await manager.update.roundOrdering(5, 'reverse');

        const secondRoundMatchLB = await storage.select('match', 19);
        assert.strictEqual(secondRoundMatchLB.opponent1.position, 4);

        const secondRoundSecondMatchLB = await storage.select('match', 20);
        assert.strictEqual(secondRoundSecondMatchLB.opponent1.position, 3);
    });

    it('should throw if round does not support ordering', async () => {
        await assert.isRejected(
            manager.update.roundOrdering(6, 'natural'), // LB Round 2
            'This round does not support ordering.',
        );

        await assert.isRejected(
            manager.update.roundOrdering(9, 'natural'), // LB Round 6 (last minor round)
            'This round does not support ordering.',
        );
    });

    it('should throw if at least one match is running or completed', async () => {
        await manager.update.match({
            id: 0,
            opponent1: { score: 1 },
        });

        await assert.isRejected(manager.update.roundOrdering(0, 'natural'), 'At least one match has started or is completed.');

        await manager.update.match({
            id: 0,
            opponent1: { result: 'win' },
        });

        await assert.isRejected(manager.update.roundOrdering(0, 'natural'), 'At least one match has started or is completed.');
    });

    it('should update all the ordering of a stage at once', async () => {
        await manager.update.ordering(0, ['pair_flip', 'half_shift', 'reverse', 'natural']);

        const firstRoundMatchWB = await storage.select('match', 0);
        assert.strictEqual(firstRoundMatchWB.opponent1.position, 2);
        assert.strictEqual(firstRoundMatchWB.opponent2.position, 1);

        const firstRoundMatchLB = await storage.select('match', 15);
        assert.strictEqual(firstRoundMatchLB.opponent1.position, 5);
        assert.strictEqual(firstRoundMatchLB.opponent2.position, 6);

        const secondRoundMatchLB = await storage.select('match', 19);
        assert.strictEqual(secondRoundMatchLB.opponent1.position, 4);

        const secondRoundSecondMatchLB = await storage.select('match', 20);
        assert.strictEqual(secondRoundSecondMatchLB.opponent1.position, 3);

        const fourthRoundMatchLB = await storage.select('match', 25);
        assert.strictEqual(fourthRoundMatchLB.opponent1.position, 1);

        const finalRoundMatchLB = await storage.select('match', 28);
        assert.strictEqual(finalRoundMatchLB.opponent1.position, 1);
    });
});

describe('Get module', () => {
    it('should get the seeding of a round-robin stage', async () => {
        storage.reset();

        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'round_robin',
            settings: {
                groupCount: 8,
                size: 32,
                seedOrdering: ['groups.seed_optimized'],
            },
        });

        const seeding = await manager.get.seeding(0);
        assert.strictEqual(seeding.length, 32);
        assert.strictEqual(seeding[0].position, 1);
        assert.strictEqual(seeding[1].position, 2);
    });

    it('should get the seeding of a single elimination stage', async () => {
        storage.reset();

        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            settings: { size: 16 },
        });

        const seeding = await manager.get.seeding(0);
        assert.strictEqual(seeding.length, 16);
        assert.strictEqual(seeding[0].position, 1);
        assert.strictEqual(seeding[1].position, 2);
    });

    it('should get the seeding with BYEs', async () => {
        storage.reset();

        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', null, 'Team 3', 'Team 4',
                'Team 5', null, null, 'Team 8',
            ],
        });

        const seeding = await manager.get.seeding(0);
        assert.strictEqual(seeding.length, 8);
        assert.strictEqual(seeding[0].position, 1);
        assert.strictEqual(seeding[1], null);
        assert.strictEqual(seeding[2].position, 3);
        assert.strictEqual(seeding[5], null);
    });
});

describe('Best-Of series matches completion', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should end Bo1 matches', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: {
                matchesChildCount: 1,
            },
        });

        await manager.update.matchGame({ id: 0, opponent1: { result: 'win' } });

        const match = await storage.select('match', 0);
        assert.strictEqual(match.opponent1.score, 1);
        assert.strictEqual(match.opponent2.score, 0);
        assert.strictEqual(match.opponent1.result, 'win');
    });

    it('should end Bo2 matches in round-robin stage', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'round_robin',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: {
                matchesChildCount: 2,
                groupCount: 1,
            },
        });

        await manager.update.matchGame({ id: 0, opponent1: { result: 'win' } });
        await manager.update.matchGame({ id: 1, opponent2: { result: 'win' } });

        const match = await storage.select('match', 0);
        assert.strictEqual(match.opponent1.score, 1);
        assert.strictEqual(match.opponent2.score, 1);
        assert.strictEqual(match.opponent1.result, 'draw');
        assert.strictEqual(match.opponent2.result, 'draw');
    });

    it('should throw if a BoX match has a tie in an elimination stage', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: {
                matchesChildCount: 2,
            },
        });

        await manager.update.matchGame({ id: 0, opponent1: { result: 'win' } });

        await assert.isRejected(manager.update.matchGame({
            id: 1,
            opponent2: { result: 'win' },
        }), 'Match games result in a tie for the parent match.');
    });

    it('should end Bo3 matches', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: {
                matchesChildCount: 3,
            },
        });

        await manager.update.matchGame({ parent_id: 0, number: 1, opponent1: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 0, number: 2, opponent1: { result: 'win' } });

        const firstMatch = await storage.select('match', 0);
        assert.strictEqual(firstMatch.opponent1.score, 2);
        assert.strictEqual(firstMatch.opponent2.score, 0);
        assert.strictEqual(firstMatch.opponent1.result, 'win');

        await manager.update.matchGame({ parent_id: 1, number: 1, opponent2: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 1, number: 2, opponent1: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 1, number: 3, opponent1: { result: 'win' } });

        const secondMatch = await storage.select('match', 1);
        assert.strictEqual(secondMatch.opponent1.score, 2);
        assert.strictEqual(secondMatch.opponent2.score, 1);
        assert.strictEqual(secondMatch.opponent1.result, 'win');
    });

    it('should let the last match be played even if not necessary', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: {
                matchesChildCount: 3,
            },
        });

        await manager.update.matchGame({ parent_id: 0, number: 1, opponent1: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 0, number: 2, opponent1: { result: 'win' } });

        let match = await storage.select('match', 0);
        assert.strictEqual(match.opponent1.score, 2);
        assert.strictEqual(match.opponent2.score, 0);
        assert.strictEqual(match.opponent1.result, 'win');

        await manager.update.matchGame({ parent_id: 0, number: 3, opponent2: { result: 'win' } });

        match = await storage.select('match', 0);
        assert.strictEqual(match.opponent1.score, 2);
        assert.strictEqual(match.opponent2.score, 1);
        assert.strictEqual(match.opponent1.result, 'win');
    });

    it('should end Bo5 matches', async () => {
        await manager.create({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: {
                matchesChildCount: 5,
            },
        });

        await manager.update.matchGame({ parent_id: 0, number: 1, opponent1: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 0, number: 2, opponent1: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 0, number: 3, opponent1: { result: 'win' } });

        const firstMatch = await storage.select('match', 0);
        assert.strictEqual(firstMatch.opponent1.score, 3);
        assert.strictEqual(firstMatch.opponent2.score, 0);
        assert.strictEqual(firstMatch.opponent1.result, 'win');

        await manager.update.matchGame({ parent_id: 1, number: 1, opponent2: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 1, number: 2, opponent1: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 1, number: 3, opponent1: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 1, number: 4, opponent1: { result: 'win' } });

        const secondMatch = await storage.select('match', 1);
        assert.strictEqual(secondMatch.opponent1.score, 3);
        assert.strictEqual(secondMatch.opponent2.score, 1);
        assert.strictEqual(secondMatch.opponent1.result, 'win');

        await manager.update.matchGame({ parent_id: 2, number: 1, opponent2: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 2, number: 2, opponent1: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 2, number: 3, opponent1: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 2, number: 4, opponent2: { result: 'win' } });
        await manager.update.matchGame({ parent_id: 2, number: 5, opponent1: { result: 'win' } });

        const thirdMatch = await storage.select('match', 2);
        assert.strictEqual(thirdMatch.opponent1.score, 3);
        assert.strictEqual(thirdMatch.opponent2.score, 2);
        assert.strictEqual(thirdMatch.opponent1.result, 'win');
    });
});
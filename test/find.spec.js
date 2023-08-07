const chai = require('chai');
chai.use(require('chai-as-promised'));

const assert = chai.assert;
const { BracketsManager } = require('../dist');
const { JsonDatabase } = require('brackets-json-db');

const storage = new JsonDatabase();
const manager = new BracketsManager(storage);

describe('Find previous and next matches in single elimination', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should find previous matches', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
        });

        const beforeFirst = await manager.find.previousMatches(0);
        assert.strictEqual(beforeFirst.length, 0);

        const beforeSemi1 = await manager.find.previousMatches(4);
        assert.strictEqual(beforeSemi1.length, 2);
        assert.strictEqual(beforeSemi1[0].id, 0);
        assert.strictEqual(beforeSemi1[1].id, 1);

        const beforeSemi2 = await manager.find.previousMatches(5);
        assert.strictEqual(beforeSemi2.length, 2);
        assert.strictEqual(beforeSemi2[0].id, 2);
        assert.strictEqual(beforeSemi2[1].id, 3);

        const beforeFinal = await manager.find.previousMatches(6);
        assert.strictEqual(beforeFinal.length, 2);
        assert.strictEqual(beforeFinal[0].id, 4);
        assert.strictEqual(beforeFinal[1].id, 5);
    });

    it('should find next matches', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
        });

        const afterFirst = await manager.find.nextMatches(0);
        assert.strictEqual(afterFirst.length, 1);
        assert.strictEqual(afterFirst[0].id, 4);

        const afterSemi1 = await manager.find.nextMatches(4);
        assert.strictEqual(afterSemi1.length, 1);
        assert.strictEqual(afterSemi1[0].id, 6);

        const afterFinal = await manager.find.nextMatches(6);
        assert.strictEqual(afterFinal.length, 0);
    });

    it('should return matches from the point of view of a participant', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
            settings: {
                seedOrdering: ['natural'],
            },
        });

        await manager.update.match({ id: 0, opponent1: { result: 'loss' } });
        const afterFirstEliminated = await manager.find.nextMatches(0, 0);
        assert.strictEqual(afterFirstEliminated.length, 0);
        const afterFirstContinued = await manager.find.nextMatches(0, 1);
        assert.strictEqual(afterFirstContinued.length, 1);

        await manager.update.match({ id: 1, opponent1: { result: 'win' } });
        const beforeSemi1Up = await manager.find.previousMatches(4, 1);
        assert.strictEqual(beforeSemi1Up.length, 1);
        assert.strictEqual(beforeSemi1Up[0].id, 0);

        const beforeSemi1Down = await manager.find.previousMatches(4, 2);
        assert.strictEqual(beforeSemi1Down.length, 1);
        assert.strictEqual(beforeSemi1Down[0].id, 1);
    });
});

describe('Find previous and next matches in double elimination', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should find previous matches', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
        });

        const beforeFirstWB = await manager.find.previousMatches(0);
        assert.strictEqual(beforeFirstWB.length, 0);

        const beforeSemi1WB = await manager.find.previousMatches(4);
        assert.strictEqual(beforeSemi1WB.length, 2);
        assert.strictEqual(beforeSemi1WB[0].id, 0);
        assert.strictEqual(beforeSemi1WB[1].id, 1);

        const beforeSemi2WB = await manager.find.previousMatches(5);
        assert.strictEqual(beforeSemi2WB.length, 2);
        assert.strictEqual(beforeSemi2WB[0].id, 2);
        assert.strictEqual(beforeSemi2WB[1].id, 3);

        const beforeFinalWB = await manager.find.previousMatches(6);
        assert.strictEqual(beforeFinalWB.length, 2);
        assert.strictEqual(beforeFinalWB[0].id, 4);
        assert.strictEqual(beforeFinalWB[1].id, 5);

        const beforeFirstRound1LB = await manager.find.previousMatches(7);
        assert.strictEqual(beforeFirstRound1LB.length, 2);
        assert.strictEqual(beforeFirstRound1LB[0].id, 0);
        assert.strictEqual(beforeFirstRound1LB[1].id, 1);

        const beforeFirstRound2LB = await manager.find.previousMatches(9);
        assert.strictEqual(beforeFirstRound2LB.length, 2);
        assert.strictEqual(beforeFirstRound2LB[0].id, 5);
        assert.strictEqual(beforeFirstRound2LB[1].id, 7);

        const beforeSemi1LB = await manager.find.previousMatches(11);
        assert.strictEqual(beforeSemi1LB.length, 2);
        assert.strictEqual(beforeSemi1LB[0].id, 9);
        assert.strictEqual(beforeSemi1LB[1].id, 10);

        const beforeFinalLB = await manager.find.previousMatches(12);
        assert.strictEqual(beforeFinalLB.length, 2);
        assert.strictEqual(beforeFinalLB[0].id, 6);
        assert.strictEqual(beforeFinalLB[1].id, 11);
    });

    it('should find next matches', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
        });

        const afterFirstWB = await manager.find.nextMatches(0);
        assert.strictEqual(afterFirstWB.length, 2);
        assert.strictEqual(afterFirstWB[0].id, 4);
        assert.strictEqual(afterFirstWB[1].id, 7);

        const afterSemi1WB = await manager.find.nextMatches(4);
        assert.strictEqual(afterSemi1WB.length, 2);
        assert.strictEqual(afterSemi1WB[0].id, 6);
        assert.strictEqual(afterSemi1WB[1].id, 10);

        const afterFinalWB = await manager.find.nextMatches(6);
        assert.strictEqual(afterFinalWB.length, 1);
        assert.strictEqual(afterFinalWB[0].id, 12);

        const afterFirstRound1LB = await manager.find.nextMatches(7);
        assert.strictEqual(afterFirstRound1LB.length, 1);
        assert.strictEqual(afterFirstRound1LB[0].id, 9);

        const afterFirstRound2LB = await manager.find.nextMatches(9);
        assert.strictEqual(afterFirstRound2LB.length, 1);
        assert.strictEqual(afterFirstRound2LB[0].id, 11);

        const afterSemi1LB = await manager.find.nextMatches(11);
        assert.strictEqual(afterSemi1LB.length, 1);
        assert.strictEqual(afterSemi1LB[0].id, 12);

        const afterFinalLB = await manager.find.nextMatches(12);
        assert.strictEqual(afterFinalLB.length, 0);
    });

    it('should return matches from the point of view of a participant', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
            ],
            settings: {
                seedOrdering: ['natural'],
            },
        });

        await manager.update.match({ id: 0, opponent1: { result: 'loss' } });
        const afterFirstEliminated = await manager.find.nextMatches(0, 0);
        assert.strictEqual(afterFirstEliminated.length, 1);
        assert.strictEqual(afterFirstEliminated[0].id, 3);
        const afterFirstContinued = await manager.find.nextMatches(0, 1);
        assert.strictEqual(afterFirstContinued.length, 1);
        assert.strictEqual(afterFirstContinued[0].id, 2);

        await manager.update.match({ id: 1, opponent1: { result: 'win' } });
        const beforeSemi1Up = await manager.find.previousMatches(2, 1);
        assert.strictEqual(beforeSemi1Up.length, 1);
        assert.strictEqual(beforeSemi1Up[0].id, 0);

        const beforeSemi1Down = await manager.find.previousMatches(2, 2);
        assert.strictEqual(beforeSemi1Down.length, 1);
        assert.strictEqual(beforeSemi1Down[0].id, 1);

        await manager.update.match({ id: 3, opponent1: { result: 'loss' } });
        const afterLowerBracketEliminated = await manager.find.nextMatches(3, 0);
        assert.strictEqual(afterLowerBracketEliminated.length, 0);
        const afterLowerBracketContinued = await manager.find.nextMatches(3, 3);
        assert.strictEqual(afterLowerBracketContinued.length, 1);
        assert.strictEqual(afterLowerBracketContinued[0].id, 4);

        await assert.isRejected(manager.find.nextMatches(2, 1), 'The match is not stale yet, so it is not possible to conclude the next matches for this participant.');

        await manager.update.match({ id: 2, opponent1: { result: 'win' } });
        const afterFinalWBForWinner = await manager.find.nextMatches(2, 1);
        assert.strictEqual(afterFinalWBForWinner.length, 0);
        const afterFinalWBForLoser = await manager.find.nextMatches(2, 2);
        assert.strictEqual(afterFinalWBForLoser.length, 1);
        assert.strictEqual(afterFinalWBForLoser[0].id, 4);

        await assert.isRejected(manager.find.nextMatches(3, 42), 'The participant does not belong to this match.');
    });
});

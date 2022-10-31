const { BracketsManager } = require('../../dist');
const { InMemoryDatabase } = require('brackets-memory-db');
const { Status } = require('brackets-model');
const each = require('mocha-each');
const { expect } = require('chai');

describe('Unit - get', () => {
    describe('currentStage', () => {
        each([
            [
                'single stage, with a running match',
                [{ tournament_id: 2, id: 0 }],
                [{ stage_id: 0, status: Status.Running }],
                { tournament_id: 2, id: 0 },
            ],
            [
                'two stages, with some running matches in 1st stage',
                [{ tournament_id: 2, id: 0 }, { tournament_id: 2, id: 1 }],
                [{ stage_id: 0, status: Status.Running }, { stage_id: 0, status: Status.Completed }, { stage_id: 1, status: Status.Waiting }],
                { tournament_id: 2, id: 0 },
            ],
            [
                'two stages, with 1st stage completed',
                [{ tournament_id: 2, id: 0 }, { tournament_id: 2, id: 1 }],
                [{ stage_id: 0, status: Status.Completed }, { stage_id: 0, status: Status.Completed }, { stage_id: 1, status: Status.Waiting }],
                { tournament_id: 2, id: 1 },
            ],
            [
                'two stages, with all matches completed',
                [{ tournament_id: 2, id: 0 }, { tournament_id: 2, id: 1 }],
                [{ stage_id: 0, status: Status.Completed }, { stage_id: 0, status: Status.Completed }, { stage_id: 1, status: Status.Completed }],
                null,
            ],
        ]).it('%j', async (_, stages, matches, expectedStage) => {
            const db = new InMemoryDatabase();
            const manager = new BracketsManager(db);
            db.setData({ stage: stages, match: matches });

            const stage = await manager.get.currentStage(2);
            expect(stage).to.deep.equal(expectedStage);
        });
    });

    describe('currentRound', () => {
        each([
            [
                'single round, with a running match',
                [{ stage_id: 2, id: 0 }],
                [{ stage_id: 2, round_id: 0, status: Status.Running }],
                { stage_id: 2, id: 0 },
            ],
            [
                'two rounds, with some running matches in 1st round',
                [{ stage_id: 2, id: 0 }, { stage_id: 2, id: 1 }],
                [{ stage_id: 2, round_id: 0, status: Status.Running }, { stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 1, status: Status.Waiting }],
                { stage_id: 2, id: 0 },
            ],
            [
                'two stages, with 1st stage completed',
                [{ stage_id: 2, id: 0 }, { stage_id: 2, id: 1 }],
                [{ stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 1, status: Status.Waiting }],
                { stage_id: 2, id: 1 },
            ],
            [
                'two stages, with all matches completed',
                [{ stage_id: 2, id: 0 }, { stage_id: 2, id: 1 }],
                [{ stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 1, status: Status.Completed }],
                null,
            ],
        ]).it('%j', async (_, rounds, matches, expectedRound) => {
            const db = new InMemoryDatabase();
            const manager = new BracketsManager(db);
            db.setData({ round: rounds, match: matches });

            const round = await manager.get.currentRound(2);
            expect(round).to.deep.equal(expectedRound);
        });
    });
});

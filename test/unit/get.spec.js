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
                'two rounds, with some uncompleted matches in 1st round',
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
            [
                'one stage, with two groups',
                [{ stage_id: 2, group_id: 0, id: 0 }, { stage_id: 2, group_id: 0, id: 1 }, { stage_id: 2, group_id: 1, id: 2 }],
                [{ stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 1, status: Status.Completed }, { stage_id: 2, round_id: 2, status: Status.Waiting }],
                { stage_id: 2, group_id: 1, id: 2 },
            ],
        ]).it('%j', async (_, rounds, matches, expectedRound) => {
            const db = new InMemoryDatabase();
            const manager = new BracketsManager(db);
            db.setData({ round: rounds, match: matches });

            const round = await manager.get.currentRound(2);
            expect(round).to.deep.equal(expectedRound);
        });
    });

    describe('currentMatches', () => {
        // OTHER STAGE ID: 1
        // CURRENT STAGE ID: 2

        each([
            [
                'single round, with a running match',
                { id: 2, type: 'single_elimination', settings: { size: 2 } },
                [{ stage_id: 2, id: 0 }],
                [{ stage_id: 2, round_id: 0, status: Status.Running }],
                [{ stage_id: 2, round_id: 0, status: Status.Running }],
            ],
            [
                'two rounds, with 1 running match and 3 locked matches with BYEs in 1st round',
                { id: 2, type: 'single_elimination', settings: { size: 8 } },
                [{ stage_id: 2, id: 0 }, { stage_id: 2, id: 1 }],
                [
                    { stage_id: 2, round_id: 0, status: Status.Running }, { stage_id: 2, round_id: 0, status: Status.Locked }, { stage_id: 2, round_id: 0, status: Status.Locked }, { stage_id: 2, round_id: 0, status: Status.Locked },
                    { stage_id: 2, round_id: 1, status: Status.Waiting }, { stage_id: 2, round_id: 1, status: Status.Ready },
                ],
                [{ stage_id: 2, round_id: 0, status: Status.Running }, { stage_id: 2, round_id: 1, status: Status.Ready }],
            ],
            [
                'two rounds, with 1 completed match and 3 locked matches with BYEs in 1st round',
                { id: 2, type: 'single_elimination', settings: { size: 8 } },
                [{ stage_id: 2, id: 0 }, { stage_id: 2, id: 1 }],
                [
                    { stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 0, status: Status.Locked }, { stage_id: 2, round_id: 0, status: Status.Locked }, { stage_id: 2, round_id: 0, status: Status.Locked },
                    { stage_id: 2, round_id: 1, status: Status.Ready }, { stage_id: 2, round_id: 1, status: Status.Ready },
                ],
                [{ stage_id: 2, round_id: 1, status: Status.Ready }, { stage_id: 2, round_id: 1, status: Status.Ready }],
            ],
            [
                'two rounds, with some uncompleted matches in 1st round',
                { id: 2, type: 'single_elimination', settings: { size: 4 } },
                [{ stage_id: 2, id: 0 }, { stage_id: 2, id: 1 }],
                [{ stage_id: 2, round_id: 0, status: Status.Running }, { stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 1, status: Status.Waiting }],
                [{ stage_id: 2, round_id: 0, status: Status.Running }],
            ],
            [
                'two stages, with 1st stage completed',
                { id: 2, type: 'single_elimination', settings: { size: 4 } },
                [{ stage_id: 1, id: 100 }, { stage_id: 2, id: 0 }, { stage_id: 2, id: 1 }],
                [{ stage_id: 1, round_id: 100, status: Status.Completed }, { stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 1, status: Status.Ready }],
                [{ stage_id: 2, round_id: 1, status: Status.Ready }],
            ],
            [
                'two stages, with all matches completed',
                { id: 2, type: 'single_elimination', settings: { size: 4 } },
                [{ stage_id: 1, id: 100 }, { stage_id: 2, id: 0 }, { stage_id: 2, id: 1 }],
                [{ stage_id: 1, round_id: 100, status: Status.Completed }, { stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 1, status: Status.Completed }],
                [],
            ],
            [
                'one stage - initial state',
                { id: 2, type: 'single_elimination', settings: { size: 4 } },
                [{ stage_id: 2, group_id: 0, id: 0 }, { stage_id: 2, group_id: 0, id: 1 }, { stage_id: 2, group_id: 1, id: 2 }],
                [{ stage_id: 2, round_id: 0, status: Status.Ready }, { stage_id: 2, round_id: 0, status: Status.Ready }, { stage_id: 2, round_id: 1, status: Status.Locked }, { stage_id: 2, round_id: 2, status: Status.Locked }],
                [{ stage_id: 2, round_id: 0, status: Status.Ready }, { stage_id: 2, round_id: 0, status: Status.Ready }],
            ],
            [
                'one stage - matches of 1st round completed and 2nd round ready',
                { id: 2, type: 'single_elimination', settings: { size: 4 } },
                [{ stage_id: 2, group_id: 0, id: 0 }, { stage_id: 2, group_id: 0, id: 1 }, { stage_id: 2, group_id: 1, id: 2 }],
                [{ stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 1, status: Status.Ready }, { stage_id: 2, round_id: 2, status: Status.Locked }],
                [{ stage_id: 2, round_id: 1, status: Status.Ready }],
            ],
            [
                'one stage - matches of 1st round completed and 2nd round running',
                { id: 2, type: 'single_elimination', settings: { size: 4 } },
                [{ stage_id: 2, group_id: 0, id: 0 }, { stage_id: 2, group_id: 0, id: 1 }, { stage_id: 2, group_id: 1, id: 2 }],
                [{ stage_id: 2, round_id: 0, status: Status.Archived }, { stage_id: 2, round_id: 0, status: Status.Archived }, { stage_id: 2, round_id: 1, status: Status.Running }, { stage_id: 2, round_id: 2, status: Status.Locked }],
                [{ stage_id: 2, round_id: 1, status: Status.Running }],
            ],
            [
                'one stage, with consolation final - initial state',
                { id: 2, type: 'single_elimination', settings: { size: 4, consolationFinal: true } },
                [{ stage_id: 2, group_id: 0, id: 0 }, { stage_id: 2, group_id: 0, id: 1 }, { stage_id: 2, group_id: 1, id: 2 }],
                [{ stage_id: 2, round_id: 0, status: Status.Ready }, { stage_id: 2, round_id: 0, status: Status.Ready }, { stage_id: 2, round_id: 1, status: Status.Locked }, { stage_id: 2, round_id: 2, status: Status.Locked }],
                [{ stage_id: 2, round_id: 0, status: Status.Ready }, { stage_id: 2, round_id: 0, status: Status.Ready }],
            ],
            [
                'one stage, with consolation final - matches of 1st round completed and 2nd round ready',
                { id: 2, type: 'single_elimination', settings: { size: 4, consolationFinal: true } },
                [{ stage_id: 2, group_id: 0, id: 0 }, { stage_id: 2, group_id: 0, id: 1 }, { stage_id: 2, group_id: 1, id: 2 }],
                [{ stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 1, status: Status.Ready }, { stage_id: 2, round_id: 2, status: Status.Locked }],
                [{ stage_id: 2, round_id: 1, status: Status.Ready }],
            ],
            [
                'one stage, with consolation final - matches of 1st round completed and 2nd round running',
                { id: 2, type: 'single_elimination', settings: { size: 4, consolationFinal: true } },
                [{ stage_id: 2, group_id: 0, id: 0 }, { stage_id: 2, group_id: 0, id: 1 }, { stage_id: 2, group_id: 1, id: 2 }],
                [{ stage_id: 2, round_id: 0, status: Status.Archived }, { stage_id: 2, round_id: 0, status: Status.Archived }, { stage_id: 2, round_id: 1, status: Status.Running }, { stage_id: 2, round_id: 2, status: Status.Locked }],
                [{ stage_id: 2, round_id: 1, status: Status.Running }],
            ],
            [
                'one stage, with consolation final - both finals running',
                { id: 2, type: 'single_elimination', settings: { size: 4, consolationFinal: true } },
                [{ stage_id: 2, group_id: 0, id: 0 }, { stage_id: 2, group_id: 0, id: 1 }, { stage_id: 2, group_id: 1, id: 2 }],
                [{ stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 1, status: Status.Running }, { stage_id: 2, round_id: 2, status: Status.Running }],
                [{ stage_id: 2, round_id: 1, status: Status.Running }, { stage_id: 2, round_id: 2, status: Status.Running }],
            ],
            [
                'one stage, with consolation final - only consolation final running',
                { id: 2, type: 'single_elimination', settings: { size: 4, consolationFinal: true } },
                [{ stage_id: 2, group_id: 0, id: 0 }, { stage_id: 2, group_id: 0, id: 1 }, { stage_id: 2, group_id: 1, id: 2 }],
                [{ stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 1, status: Status.Completed }, { stage_id: 2, round_id: 2, status: Status.Running }],
                [{ stage_id: 2, round_id: 2, status: Status.Running }],
            ],
            [
                'one stage, with consolation final - both finals completed',
                { id: 2, type: 'single_elimination', settings: { size: 4, consolationFinal: true } },
                [{ stage_id: 2, group_id: 0, id: 0 }, { stage_id: 2, group_id: 0, id: 1 }, { stage_id: 2, group_id: 1, id: 2 }],
                [{ stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 0, status: Status.Completed }, { stage_id: 2, round_id: 1, status: Status.Completed }, { stage_id: 2, round_id: 2, status: Status.Completed }],
                [],
            ],
        ]).it('%j', async (_, stage, rounds, matches, expectedMatches) => {
            const db = new InMemoryDatabase();
            const manager = new BracketsManager(db);
            db.setData({ stage: [stage], round: rounds, match: matches });

            const round = await manager.get.currentMatches(2);
            expect(round).to.deep.equal(expectedMatches);
        });
    });
});

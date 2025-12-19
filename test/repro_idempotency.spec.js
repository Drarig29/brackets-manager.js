const assert = require('chai').assert;
const brackets = require('../dist');
const { InMemoryDatabase } = require('brackets-memory-db');

describe('Update idempotency', () => {
    let storage;
    let manager;

    beforeEach(() => {
        storage = new InMemoryDatabase();
        manager = new brackets.BracketsManager(storage);
    });

    it('should NOT propagate again if update is idempotent', async () => {
        const stage = await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: { size: 4 }
        });

        const rounds = await storage.select('round', { stage_id: stage.id });
        const round1 = rounds.find(r => r.number === 1);
        const match1 = await storage.selectFirst('match', { round_id: round1.id, number: 1 });
        console.log('Match 1 ID:', match1.id);

        // Manually complete the match in storage WITHOUT propagating
        // This simulates a "corrupted" or "stuck" state
        await storage.update('match', match1.id, {
            status: 4, // Completed
            opponent1: { ...match1.opponent1, score: 10, result: 'win' },
            opponent2: { ...match1.opponent2, score: 0, result: 'loss' },
        });

        // Verify next match is empty
        const round2 = rounds.find(r => r.number === 2);
        let finalMatch = await storage.selectFirst('match', { round_id: round2.id, number: 1 });
        assert.isNull(finalMatch.opponent1.id, 'Next match should be empty initially');

        // Now call manager.update.match with the SAME data
        await manager.update.match({
            id: match1.id,
            opponent1: { score: 10, result: 'win' },
            opponent2: { score: 0, result: 'loss' },
            status: 4
        });

        // Verify next match is STILL empty (propagation skipped)
        finalMatch = await storage.selectFirst('match', { round_id: round2.id, number: 1 });
        assert.isNull(finalMatch.opponent1.id, 'Next match should still be empty because update was idempotent');
    });
});

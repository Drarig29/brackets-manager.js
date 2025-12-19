const assert = require('chai').assert;
const brackets = require('../dist');
const { InMemoryDatabase } = require('brackets-memory-db');

describe('Reproduction of propagation issue', () => {
    let storage;
    let manager;

    beforeEach(() => {
        storage = new InMemoryDatabase();
        manager = new brackets.BracketsManager(storage);
    });

    it('should propagate winner to final when opponent is already there via Bye', async () => {
        // Create 3-person tournament to force a Bye
        const stage = await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3'],
            settings: { size: 4 }
        });

        // Team 1 vs Team 2 (Match 1)
        // Team 3 vs BYE (Match 2) -> Team 3 advances to Final instantly

        // Find Match 1
        const rounds = await storage.select('round', { stage_id: stage.id });
        console.log('Stage created:', stage);
        console.log('Rounds found:', rounds);

        const round1 = rounds.find(r => r.number === 1);
        if (!round1) throw new Error('Round 1 not found in created stage');

        // Find the match that has two real opponents (the playable match)
        const matches1 = await storage.select('match', { round_id: round1.id }) || [];
        console.log('Matches found in Round 1:', matches1);

        const playableMatch = matches1.find(m => m.opponent1 && m.opponent1.id !== null && m.opponent2 && m.opponent2.id !== null);

        if (!playableMatch) throw new Error('Could not find a playable match in Round 1');

        console.log('Playable Match:', JSON.stringify(playableMatch, null, 2));

        // Update the playable match
        await manager.update.match({
            id: playableMatch.id,
            opponent1: { score: 4, result: 'win' },
            opponent2: { score: 3, result: 'loss' },
            status: 4 // Completed
        });

        // Check Final (Round 2)
        const round2 = rounds.find(r => r.number === 2);
        const finalMatch = await storage.selectFirst('match', { round_id: round2.id, number: 1 });

        console.log('Final Match:', JSON.stringify(finalMatch, null, 2));

        // One slot should hold the Bye winner, the other should hold the playable match winner
        // We don't know which ID is which without checking the Bye match logic, but we just want to ensure NO SLOT IS NULL/TBD.
        // Wait, TBD is { id: null }. BYE is null.
        // If propagation worked, both opponents should have an ID.
        // If propagation failed, one will be { id: null } (TBD).

        assert.isNotNull(finalMatch.opponent1, 'Opponent 1 is null (Bye?)');
        assert.isNotNull(finalMatch.opponent2, 'Opponent 2 is null (Bye?)');
        assert.isNotNull(finalMatch.opponent1.id, 'Final Opponent 1 ID should not be null (TBD)');
        assert.isNotNull(finalMatch.opponent2.id, 'Final Opponent 2 ID should not be null (TBD)');
    });
});

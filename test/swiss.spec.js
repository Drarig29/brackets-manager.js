const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { BracketsManager } = require('../dist');
const { InMemoryDatabase } = require('brackets-memory-db');

chai.use(chaiAsPromised);
const expect = chai.expect;

const storage = new InMemoryDatabase();
const manager = new BracketsManager(storage);

describe('Swiss System', () => {
    beforeEach(async () => {
        storage.reset();
    });

    it('should create a swiss stage with round 1 matches (8 participants)', async () => {
        const stage = await manager.create.stage({
            name: 'Swiss Stage',
            tournamentId: 0,
            type: 'swiss',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6', 'Team 7', 'Team 8'],
            settings: {
                size: 8,
            },
        });

        expect(stage.id).to.equal(0);
        expect(stage.type).to.equal('swiss');

        const group = await storage.selectFirst('group', { stage_id: stage.id });
        expect(group).to.not.be.null;

        const round = await storage.selectFirst('round', { group_id: group.id });
        expect(round).to.not.be.null;
        expect(round.number).to.equal(1);

        const matches = await storage.select('match', { round_id: round.id });
        expect(matches.length).to.equal(4);

        // Standard Swiss pairing: 1 vs 5, 2 vs 6, 3 vs 7, 4 vs 8
        // IDs: 0 vs 4, 1 vs 5, 2 vs 6, 3 vs 7
        const match1 = matches.find(m => m.number === 1);
        expect(match1.opponent1.id).to.equal(0);
        expect(match1.opponent2.id).to.equal(4);

        const match2 = matches.find(m => m.number === 2);
        expect(match2.opponent1.id).to.equal(1);
        expect(match2.opponent2.id).to.equal(5);
    });

    it('should throw if participant count is not power of two (without balanceByes)', async () => {
        await expect(manager.create.stage({
            name: 'Swiss Odd',
            tournamentId: 0,
            type: 'swiss',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5'],
            settings: {
                size: 5,
            },
        })).to.be.rejectedWith('The library only supports a participant count which is a power of two.');
    });

    it('should handle odd number of participants with balanceByes enabled', async () => {
        const stage = await manager.create.stage({
            name: 'Swiss Balanced',
            tournamentId: 0,
            type: 'swiss',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5'],
            settings: {
                size: 8, // Next power of 2
                balanceByes: true,
            },
        });

        const matches = await storage.select('match', { stage_id: stage.id });
        expect(matches.length).to.equal(4); // 4 pairings for 8 slots

        // With 5 participants and balanceByes:
        // Seeding becomes: [T1, T2, T3, T4, T5, null, null, null] (depending on balanceByes implementation)
        // Actually balanceByes preserves order or ensures evenness?
        // Let's verify who plays whom.
        // If simply padded:
        // Top: [T1, T2, T3, T4]
        // Bottom: [T5, Bye, Bye, Bye]
        // Matches: 1v5, 2vBye, 3vBye, 4vBye. (If 1-based indices)

        // Let's check matching for specific IDs.
        // IDs: 0-4 are teams. nulls are Byes.

        const m1 = matches.find(m => m.number === 1);
        const m2 = matches.find(m => m.number === 2);
        const m3 = matches.find(m => m.number === 3);
        const m4 = matches.find(m => m.number === 4);

        // We expect some matches to have opponent2 = null (BYE)
        const byeMatches = matches.filter(m => m.opponent1 === null || m.opponent2 === null);
        expect(byeMatches.length).to.be.at.least(1);
    });

    it('should create only one round initially', async () => {
        const stage = await manager.create.stage({
            name: 'Swiss Stage',
            tournamentId: 0,
            type: 'swiss',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: { size: 4 },
        });

        const rounds = await storage.select('round', { stage_id: stage.id });
        expect(rounds.length).to.equal(1);
    });

    it('should simulate a full swiss tournament (6 participants)', async () => {
        const stage = await manager.create.stage({
            name: 'Swiss Simulation',
            tournamentId: 0,
            type: 'swiss',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6'],
            settings: { size: 8, balanceByes: true }, // Balance to 8
        });

        expect(stage).to.not.be.null;

        // Helper to play a round
        const playRound = async (roundNumber) => {
            const group = await storage.selectFirst('group', { stage_id: stage.id });
            const round = await storage.selectFirst('round', { group_id: group.id, number: roundNumber });
            expect(round).to.not.be.null;

            const matches = await storage.select('match', { round_id: round.id });
            // 6 participants + 2 BYEs = 8 slots. 4 matches per round.
            // Matches with BYEs are auto-completed/locked?
            // In brackets-manager, matches with BYEs are usually created with statusLocked or similar, or just one opponent is null.
            // If they are not auto-completed, we need to complete them.

            for (const match of matches) {
                // If it's a BYE match (one opponent is null), it might be already handled or we ignore it.
                if (match.opponent1 === null || match.opponent2 === null) continue;

                // Randomly pick a winner
                const winner = Math.random() > 0.5 ? 'opponent1' : 'opponent2';
                await manager.update.match({
                    id: match.id,
                    opponent1: { result: winner === 'opponent1' ? 'win' : 'loss' },
                    opponent2: { result: winner === 'opponent2' ? 'win' : 'loss' },
                });
            }
        };

        // Round 1
        console.log('Playing Round 1...');
        await playRound(1);

        // Round 2 should be created automatically
        console.log('Playing Round 2...');
        const round2 = await storage.selectFirst('round', { stage_id: stage.id, number: 2 });
        expect(round2).to.not.be.undefined;
        await playRound(2);

        // Round 3
        console.log('Playing Round 3...');
        const round3 = await storage.selectFirst('round', { stage_id: stage.id, number: 3 });
        expect(round3).to.not.be.undefined;
        await playRound(3);

        // With 6 participants, log2(6) is ~2.58 -> 3 rounds.
        // After 3 rounds, we should check standings.
        const standings = await manager.get.finalStandings(stage.id);
        console.log('Final Standings:', JSON.stringify(standings, null, 2));
        expect(standings.length).to.equal(6);
        // 6 Real participants + 2 BYEs. 
        // Standings usually filters out BYEs if mapped to participants?
    });
});

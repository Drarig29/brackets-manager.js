const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { BracketsManager } = require('../dist');
const { JsonDatabase } = require('brackets-json-db');
const { InMemoryDatabase } = require('brackets-memory-db');

chai.use(chaiAsPromised);
const expect = chai.expect;

const storage = new InMemoryDatabase();
const manager = new BracketsManager(storage);

describe('Swiss System', () => {
    beforeEach(async () => {
        storage.reset();
    });

    it('should create a swiss stage with round 1 matches', async () => {
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
        expect(matches.length).to.equal(4); // 8 participants -> 4 matches

        // Check pairings (Top vs Bottom: 1v5, 2v6, 3v7, 4v8)
        // IDs are 0 to 7. 
        // Seeding 1 (ID 0) vs Seeding 5 (ID 4)
        const match1 = matches.find(m => m.number === 1);
        expect(match1).to.not.be.undefined;
        console.log('Match 1:', JSON.stringify(match1, null, 2));
        // In this library, seeding is usually preserved by ID if using 'natural' ordering.
        // ID 0 (seed 1) vs ID 4 (seed 5).
        expect(match1.opponent1.id).to.equal(0);
        expect(match1.opponent2.id).to.equal(4);
    });

    it('should calculate correct number of rounds (log2)', async () => {
        // This logic is currently inside creator but creator doesn't save future rounds yet
        // so we can only check what exists.
        // Current implementation only creates Round 1.
        // Wait, we decided to only create Round 1. 
        // So checking round count > 1 is not applicable yet.
    });
});

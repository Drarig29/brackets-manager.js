const chai = require('chai');
chai.use(require('chai-as-promised'));

const assert = chai.assert;
const { BracketsManager } = require('../dist');
const { JsonDatabase } = require('brackets-json-db');

const storage = new JsonDatabase();
const manager = new BracketsManager(storage);

const makeStandingsItem = (participants, slot, rank) => {
    const participant = participants.find(participant => participant.id === slot.id);
    return { id: participant.id, name: participant.name, rank };
};

describe('Get child games', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should get child games of a list of matches', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
            ],
            settings: { matchesChildCount: 2 },
        });

        const matches = await storage.select('match', { round_id: 0 });
        const games = await manager.get.matchGames(matches);

        assert.strictEqual(matches.length, 2);
        assert.strictEqual(games.length, 4);
        assert.strictEqual(games[2].parent_id, 1);
    });

    it('should get child games of a list of matches with some which do not have child games', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
            ],
            settings: { matchesChildCount: 2 },
        });

        await manager.update.matchChildCount('match', 1, 0); // Remove child games from match id 1.

        const matches = await storage.select('match', { round_id: 0 });
        const games = await manager.get.matchGames(matches);

        assert.strictEqual(matches.length, 2);
        assert.strictEqual(games.length, 2); // Only two child games.
    });
});

describe('Get current round', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should skip a round decided by BYEs when getting the current round', async () => {
        const stage = await manager.create.stage({
            name: 'Some Title',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['P1', 'P2', 'P3', null],
            settings: {
                grandFinal: 'simple',
                balanceByes: true,
                matchesChildCount: 3,
            },
        });

        assert.strictEqual((await manager.get.currentRound(stage.id)).number, 1);
        assert.deepEqual((await manager.get.currentMatches(stage.id)).map(match => match.round_id), [0]);

        await manager.update.match({ id: 1, opponent1: { result: 'win' } });

        const currentRound = await manager.get.currentRound(stage.id);
        const currentMatches = await manager.get.currentMatches(stage.id);

        assert.strictEqual(currentRound.number, 2);
        assert.deepEqual(currentMatches.map(match => match.round_id), [currentRound.id]);
    });
});

describe('Get final standings', () => {

    beforeEach(() => {
        storage.reset();
    });

    it('should get the final standings for a single elimination stage with consolation final', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
            settings: { consolationFinal: true },
        });

        for (let i = 0; i < 8; i++) {
            await manager.update.match({
                id: i,
                ...i % 2 === 0 ? { opponent1: { result: 'win' } } : { opponent2: { result: 'win' } },
            });
        }

        const finalStandings = await manager.get.finalStandings(0);

        assert.deepEqual(finalStandings, [
            { id: 0, name: 'Team 1', rank: 1 },
            { id: 5, name: 'Team 6', rank: 2 },

            // The consolation final has inverted those ones (rank 3).
            { id: 1, name: 'Team 2', rank: 3 },
            { id: 4, name: 'Team 5', rank: 4 },

            { id: 7, name: 'Team 8', rank: 5 },
            { id: 3, name: 'Team 4', rank: 5 },
            { id: 6, name: 'Team 7', rank: 5 },
            { id: 2, name: 'Team 3', rank: 5 },
        ]);
    });

    it('should get the final standings for a single elimination stage without consolation final', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
            settings: { consolationFinal: false },
        });

        for (let i = 0; i < 7; i++) {
            await manager.update.match({
                id: i,
                ...i % 2 === 0 ? { opponent1: { result: 'win' } } : { opponent2: { result: 'win' } },
            });
        }

        const finalStandings = await manager.get.finalStandings(0);

        assert.deepEqual(finalStandings, [
            { id: 0, name: 'Team 1', rank: 1 },
            { id: 5, name: 'Team 6', rank: 2 },

            // Here, they are not inverted (rank 3).
            { id: 4, name: 'Team 5', rank: 3 },
            { id: 1, name: 'Team 2', rank: 3 },

            { id: 7, name: 'Team 8', rank: 4 },
            { id: 3, name: 'Team 4', rank: 4 },
            { id: 6, name: 'Team 7', rank: 4 },
            { id: 2, name: 'Team 3', rank: 4 },
        ]);
    });

    it('should get shared first place for a single elimination final double forfeit', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
        });

        await manager.update.match({ id: 0, opponent1: { result: 'win' } });
        await manager.update.match({ id: 1, opponent1: { result: 'win' } });

        const semiFinals = await storage.select('match', { round_id: 0 });
        const final = await storage.select('match', 2);

        await manager.update.match({
            id: final.id,
            opponent1: { forfeit: true },
            opponent2: { forfeit: true },
        });

        const participants = await storage.select('participant', { tournament_id: 0 });
        const finalStandings = await manager.get.finalStandings(0);

        assert.deepEqual(finalStandings, [
            makeStandingsItem(participants, final.opponent1, 1),
            makeStandingsItem(participants, final.opponent2, 1),
            makeStandingsItem(participants, semiFinals[0].opponent2, 2),
            makeStandingsItem(participants, semiFinals[1].opponent2, 2),
        ]);
    });

    it('should keep consolation final ranks after a single elimination final double forfeit', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
            settings: { consolationFinal: true },
        });

        await manager.update.match({ id: 0, opponent1: { result: 'win' } });
        await manager.update.match({ id: 1, opponent1: { result: 'win' } });

        const groups = await storage.select('group', { stage_id: 0 });
        const final = (await storage.select('match', { group_id: groups[0].id })).pop();
        const consolationFinal = (await storage.select('match', { group_id: groups[1].id })).pop();

        await manager.update.match({ id: consolationFinal.id, opponent1: { result: 'win' } });

        await manager.update.match({
            id: final.id,
            opponent1: { forfeit: true },
            opponent2: { forfeit: true },
        });

        const participants = await storage.select('participant', { tournament_id: 0 });
        const finalStandings = await manager.get.finalStandings(0);

        assert.deepEqual(finalStandings, [
            makeStandingsItem(participants, final.opponent1, 1),
            makeStandingsItem(participants, final.opponent2, 1),
            makeStandingsItem(participants, consolationFinal.opponent1, 2),
            makeStandingsItem(participants, consolationFinal.opponent2, 3),
        ]);
    });

    it('should get the final standings for a double elimination stage with a grand final', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
            settings: { grandFinal: 'double' },
        });

        for (let i = 0; i < 15; i++) {
            await manager.update.match({
                id: i,
                ...i % 2 === 0 ? { opponent1: { result: 'win' } } : { opponent2: { result: 'win' } },
            });
        }

        const finalStandings = await manager.get.finalStandings(0);

        assert.deepEqual(finalStandings, [
            { id: 0, name: 'Team 1', rank: 1 },
            { id: 5, name: 'Team 6', rank: 2 },
            { id: 4, name: 'Team 5', rank: 3 },
            { id: 3, name: 'Team 4', rank: 4 },
            { id: 1, name: 'Team 2', rank: 5 },
            { id: 6, name: 'Team 7', rank: 5 },
            { id: 7, name: 'Team 8', rank: 6 },
            { id: 2, name: 'Team 3', rank: 6 },
        ]);
    });

    it('should get shared first place for a double elimination grand final double forfeit', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
            ],
            settings: { grandFinal: 'simple' },
        });

        const groups = await storage.select('group', { stage_id: 0 });
        const grandFinal = (await storage.select('match', { group_id: groups[2].id }))[0];
        const matches = (await storage.select('match', { stage_id: 0 }))
            .filter(match => match.id !== grandFinal.id)
            .sort((a, b) => a.id - b.id);

        for (const match of matches)
            await manager.update.match({ id: match.id, opponent1: { result: 'win' } });

        const final = await storage.select('match', grandFinal.id);

        await manager.update.match({
            id: final.id,
            opponent1: { forfeit: true },
            opponent2: { forfeit: true },
        });

        const participants = await storage.select('participant', { tournament_id: 0 });
        const finalStandings = await manager.get.finalStandings(0);

        assert.deepEqual(finalStandings.slice(0, 2), [
            makeStandingsItem(participants, final.opponent1, 1),
            makeStandingsItem(participants, final.opponent2, 1),
        ]);
        assert.strictEqual(finalStandings[2].rank, 2);
    });

    it('should get shared first place for a double grand final reset match double forfeit', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
            ],
            settings: { grandFinal: 'double' },
        });

        const groups = await storage.select('group', { stage_id: 0 });
        const grandFinalMatches = await storage.select('match', { group_id: groups[2].id });
        const matches = (await storage.select('match', { stage_id: 0 }))
            .filter(match => match.group_id !== groups[2].id)
            .sort((a, b) => a.id - b.id);

        for (const match of matches)
            await manager.update.match({ id: match.id, opponent1: { result: 'win' } });

        await manager.update.match({ id: grandFinalMatches[0].id, opponent2: { result: 'win' } });

        const resetMatch = await storage.select('match', grandFinalMatches[1].id);

        await manager.update.match({
            id: resetMatch.id,
            opponent1: { forfeit: true },
            opponent2: { forfeit: true },
        });

        const participants = await storage.select('participant', { tournament_id: 0 });
        const finalStandings = await manager.get.finalStandings(0);

        assert.deepEqual(finalStandings.slice(0, 2), [
            makeStandingsItem(participants, resetMatch.opponent1, 1),
            makeStandingsItem(participants, resetMatch.opponent2, 1),
        ]);
        assert.strictEqual(finalStandings[2].rank, 2);
    });

    it('should get the final standings for a double elimination stage without a grand final', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
            settings: { grandFinal: 'none' },
        });

        for (let i = 0; i < 13; i++) {
            await manager.update.match({
                id: i,
                // The parity is reversed here, just to have different results.
                ...i % 2 === 1 ? { opponent1: { result: 'win' } } : { opponent2: { result: 'win' } },
            });
        }

        const finalStandings = await manager.get.finalStandings(0);

        assert.deepEqual(finalStandings, [
            { id: 6, name: 'Team 7', rank: 1 },
            { id: 2, name: 'Team 3', rank: 2 },
            { id: 3, name: 'Team 4', rank: 3 },
            { id: 5, name: 'Team 6', rank: 4 },
            { id: 0, name: 'Team 1', rank: 5 },
            { id: 7, name: 'Team 8', rank: 5 },
            { id: 4, name: 'Team 5', rank: 6 },
            { id: 1, name: 'Team 2', rank: 6 },
        ]);
    });

    it('should throw for single elimination stage with a ranking formula', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: ['Team 1', 'Team 2'],
        });

        await assert.isRejected(manager.get.finalStandings(0, (item) => item.wins), 'Round-robin options are not supported for elimination stages.');
    });

    it('should throw for double elimination stage with a ranking formula', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'double_elimination',
            seeding: ['Team 1', 'Team 2'],
        });

        await assert.isRejected(manager.get.finalStandings(0, (item) => item.wins), 'Round-robin options are not supported for elimination stages.');
    });

    it('should get the final standings for a round-robin stage with a ranking formula', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'round_robin',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
            settings: {
                groupCount: 2,
            },
        });

        for (let i = 0; i < 12; i++) {
            await manager.update.match({
                id: i,
                ...i % 2 === 0 ? { opponent1: { result: 'win' } } : { opponent2: { result: 'win' } },
            });
        }

        const finalStandings = await manager.get.finalStandings(0, {
            rankingFormula: (item) => 3 * item.wins,
        });

        assert.deepEqual(finalStandings, [
            { id: 0, name: 'Team 1', rank: 1, groupId: 0, played: 3, wins: 2, draws: 0, losses: 1, forfeits: 0, scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, points: 6 },
            { id: 2, name: 'Team 3', rank: 1, groupId: 0, played: 3, wins: 2, draws: 0, losses: 1, forfeits: 0, scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, points: 6 },
            { id: 4, name: 'Team 5', rank: 1, groupId: 0, played: 3, wins: 2, draws: 0, losses: 1, forfeits: 0, scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, points: 6 },
            { id: 1, name: 'Team 2', rank: 1, groupId: 1, played: 3, wins: 2, draws: 0, losses: 1, forfeits: 0, scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, points: 6 },
            { id: 3, name: 'Team 4', rank: 1, groupId: 1, played: 3, wins: 2, draws: 0, losses: 1, forfeits: 0, scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, points: 6 },
            { id: 5, name: 'Team 6', rank: 1, groupId: 1, played: 3, wins: 2, draws: 0, losses: 1, forfeits: 0, scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, points: 6 },
            { id: 6, name: 'Team 7', rank: 2, groupId: 0, played: 3, wins: 0, draws: 0, losses: 3, forfeits: 0, scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, points: 0 },
            { id: 7, name: 'Team 8', rank: 2, groupId: 1, played: 3, wins: 0, draws: 0, losses: 3, forfeits: 0, scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, points: 0 },
        ]);
    });

    it('should get the final standings for a round-robin stage with a ranking formula and max qualified participants per group', async () => {
        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'round_robin',
            seeding: [
                'Team 1', 'Team 2', 'Team 3', 'Team 4',
                'Team 5', 'Team 6', 'Team 7', 'Team 8',
            ],
            settings: {
                groupCount: 2,
            },
        });

        for (let i = 0; i < 12; i++) {
            await manager.update.match({
                id: i,
                ...i % 2 === 0 ? { opponent1: { result: 'win' } } : { opponent2: { result: 'win' } },
            });
        }

        const finalStandings = await manager.get.finalStandings(0, {
            rankingFormula: (item) => 3 * item.wins,
            maxQualifiedParticipantsPerGroup: 2,
        });

        assert.deepEqual(finalStandings, [
            { id: 0, name: 'Team 1', rank: 1, groupId: 0, played: 3, wins: 2, draws: 0, losses: 1, forfeits: 0, scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, points: 6 },
            { id: 2, name: 'Team 3', rank: 1, groupId: 0, played: 3, wins: 2, draws: 0, losses: 1, forfeits: 0, scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, points: 6 },
            { id: 1, name: 'Team 2', rank: 1, groupId: 1, played: 3, wins: 2, draws: 0, losses: 1, forfeits: 0, scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, points: 6 },
            { id: 3, name: 'Team 4', rank: 1, groupId: 1, played: 3, wins: 2, draws: 0, losses: 1, forfeits: 0, scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, points: 6 },
        ]);
    });
});

describe('Get seeding', () => {

    it('should get the seeding of a round-robin stage', async () => {
        storage.reset();

        await manager.create.stage({
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

    it('should get the seeding of a round-robin stage with BYEs', async () => {
        storage.reset();

        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'round_robin',
            settings: {
                groupCount: 2,
                size: 8,
            },
            seeding: [
                'Team 1', null, null, null,
                null, null, null, null,
            ],
        });

        const seeding = await manager.get.seeding(0);
        assert.strictEqual(seeding.length, 8);
    });

    it('should get the seeding of a round-robin stage with BYEs after update', async () => {
        storage.reset();

        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'round_robin',
            settings: {
                groupCount: 2,
                size: 8,
            },
        });

        await manager.update.seeding(0, [
            'Team 1', null, null, null,
            null, null, null, null,
        ]);

        const seeding = await manager.get.seeding(0);
        assert.strictEqual(seeding.length, 8);
    });

    it('should get the seeding of a single elimination stage', async () => {
        storage.reset();

        await manager.create.stage({
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

        await manager.create.stage({
            name: 'Example',
            tournamentId: 0,
            type: 'single_elimination',
            seeding: [
                'Team 1', null, 'Team 3', 'Team 4',
                'Team 5', null, null, 'Team 8',
            ],
            settings: {
                seedOrdering: ['inner_outer'],
            },
        });

        const seeding = await manager.get.seeding(0);
        assert.strictEqual(seeding.length, 8);
        assert.deepStrictEqual(seeding, [
            { id: 0, position: 1 },
            null,
            { id: 1, position: 3 },
            { id: 2, position: 4 },
            { id: 3, position: 5 },
            null,
            null,
            { id: 4, position: 8 },
        ]);
    });
});

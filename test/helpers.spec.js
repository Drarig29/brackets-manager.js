const assert = require('chai').assert;
const { ordering } = require('../dist/ordering');
const { makeGroups, assertRoundRobin, balanceByes, makeRoundRobinMatches } = require('../dist/helpers');

describe('Helpers', () => {

    describe('Round-robin groups', () => {

        it('should place participants in groups', () => {
            assert.deepStrictEqual(makeGroups([1, 2, 3, 4, 5], 2), [[1, 2, 3], [4, 5]]);
            assert.deepStrictEqual(makeGroups([1, 2, 3, 4, 5, 6, 7, 8], 2), [[1, 2, 3, 4], [5, 6, 7, 8]]);
            assert.deepStrictEqual(makeGroups([1, 2, 3, 4, 5, 6, 7, 8], 3), [[1, 2, 3], [4, 5, 6], [7, 8]]);
        });

        it('should make the rounds for a round-robin group', () => {
            assertRoundRobin([1, 2, 3], makeRoundRobinMatches([1, 2, 3]));
            assertRoundRobin([1, 2, 3, 4], makeRoundRobinMatches([1, 2, 3, 4]));
            assertRoundRobin([1, 2, 3, 4, 5], makeRoundRobinMatches([1, 2, 3, 4, 5]));
            assertRoundRobin([1, 2, 3, 4, 5, 6], makeRoundRobinMatches([1, 2, 3, 4, 5, 6]));
        });
    });

    describe('Seed ordering methods', () => {

        it('should place 2 participants with inner-outer method', () => {
            const teams = [1, 2]; // This is the minimum participant count supported by the library.
            const placement = ordering['inner_outer'](teams);
            assert.deepStrictEqual(placement, [
                1, 2,
            ]);
        });

        it('should place 4 participants with inner-outer method', () => {
            const teams = [1, 2, 3, 4];
            const placement = ordering['inner_outer'](teams);
            assert.deepStrictEqual(placement, [
                1, 4,
                2, 3,
            ]);
        });

        it('should place 8 participants with inner-outer method', () => {
            const teams = [1, 2, 3, 4, 5, 6, 7, 8];
            const placement = ordering['inner_outer'](teams);
            assert.deepStrictEqual(placement, [
                1, 8,
                4, 5,
                2, 7,
                3, 6,
            ]);
        });

        it('should place 16 participants with inner-outer method', () => {
            const teams = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
            const placement = ordering['inner_outer'](teams);
            assert.deepStrictEqual(placement, [
                1, 16,
                8, 9,
                4, 13,
                5, 12,
                2, 15,
                7, 10,
                3, 14,
                6, 11,
            ]);
        });

        it('should place 32 participants with inner-outer method', () => {
            const teams = Array.from({ length: 32 }, (_, i) => i + 1);
            const placement = ordering['inner_outer'](teams);
            assert.deepStrictEqual(placement, [
                1, 32,
                16, 17,
                8, 25,
                9, 24,
                4, 29,
                13, 20,
                5, 28,
                12, 21,
                2, 31,
                15, 18,
                7, 26,
                10, 23,
                3, 30,
                14, 19,
                6, 27,
                11, 22,
            ]);
        });

        it('should make a natural ordering', () => {
            assert.deepStrictEqual(ordering['natural']([1, 2, 3, 4, 5, 6, 7, 8]), [1, 2, 3, 4, 5, 6, 7, 8]);
        });

        it('should make a reverse ordering', () => {
            assert.deepStrictEqual(ordering['reverse']([1, 2, 3, 4, 5, 6, 7, 8]), [8, 7, 6, 5, 4, 3, 2, 1]);
        });

        it('should make a half shift ordering', () => {
            assert.deepStrictEqual(ordering['half_shift']([1, 2, 3, 4, 5, 6, 7, 8]), [5, 6, 7, 8, 1, 2, 3, 4]);
        });

        it('should make a reverse half shift ordering', () => {
            assert.deepStrictEqual(ordering['reverse_half_shift']([1, 2, 3, 4, 5, 6, 7, 8]), [4, 3, 2, 1, 8, 7, 6, 5]);
        });

        it('should make a pair flip ordering', () => {
            assert.deepStrictEqual(ordering['pair_flip']([1, 2, 3, 4, 5, 6, 7, 8]), [2, 1, 4, 3, 6, 5, 8, 7]);
        });

        it('should make an effort balanced ordering for groups', () => {
            assert.deepStrictEqual(ordering['groups.effort_balanced']([1, 2, 3, 4, 5, 6, 7, 8], 4), [
                1, 5, // 1st group
                2, 6, // 2nd group
                3, 7, // 3rd group
                4, 8, // 4th group
            ]);

            assert.deepStrictEqual(ordering['groups.effort_balanced']([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 4), [
                1, 5, 9, 13,  // 1st group
                2, 6, 10, 14, // 2nd group
                3, 7, 11, 15, // 3rd group
                4, 8, 12, 16, // 4th group
            ]);

            assert.deepStrictEqual(ordering['groups.effort_balanced']([1, 2, 3, 4, 5, 6, 7, 8], 2), [
                1, 3, 5, 7, // 1st group
                2, 4, 6, 8, // 2nd group
            ]);
        });

        it('should make a snake ordering for groups', () => {
            assert.deepStrictEqual(ordering['groups.seed_optimized']([1, 2, 3, 4, 5, 6, 7, 8], 4), [
                1, 8, // 1st group
                2, 7, // 2nd group
                3, 6, // 3rd group
                4, 5, // 4th group
            ]);

            assert.deepStrictEqual(ordering['groups.seed_optimized']([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 4), [
                1, 8, 9, 16,  // 1st group
                2, 7, 10, 15, // 2nd group
                3, 6, 11, 14, // 3rd group
                4, 5, 12, 13, // 4th group
            ]);

            assert.deepStrictEqual(ordering['groups.seed_optimized']([1, 2, 3, 4, 5, 6, 7, 8], 2), [
                1, 4, 5, 8, // 1st group
                2, 3, 6, 7, // 2nd group
            ]);
        });

        it('should make a bracket-optimized ordering for groups (8 seeds, 4 groups)', () => {
            const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
            const result = ordering['groups.bracket_optimized'](seeds, 4);

            const groups = makeGroups(result, 4);

            // Build first-round bracket pairs using inner-outer.
            const bracket = ordering['inner_outer'](seeds);
            const pairs = Array.from({ length: bracket.length / 2 }, (_, i) => [bracket[2 * i], bracket[2 * i + 1]]);

            // Each pair of bracket opponents must be split across two different groups.
            for (const [a, b] of pairs) {
                const ga = groups.findIndex(g => g.includes(a));
                const gb = groups.findIndex(g => g.includes(b));
                assert.notStrictEqual(ga, -1);
                assert.notStrictEqual(gb, -1);
                assert.notStrictEqual(ga, gb);
            }
        });

        it('should make a bracket-optimized ordering for groups (16 seeds, 4 groups)', () => {
            const seeds = Array.from({ length: 16 }, (_, i) => i + 1);
            const result = ordering['groups.bracket_optimized'](seeds, 4);

            const groups = makeGroups(result, 4);

            // Split bracket opponents.
            const bracket = ordering['inner_outer'](seeds);
            const pairs = Array.from({ length: bracket.length / 2 }, (_, i) => [bracket[2 * i], bracket[2 * i + 1]]);

            for (const [a, b] of pairs) {
                const ga = groups.findIndex(g => g.includes(a));
                const gb = groups.findIndex(g => g.includes(b));
                assert.notStrictEqual(ga, -1);
                assert.notStrictEqual(gb, -1);
                assert.notStrictEqual(ga, gb);
            }

            // Ensure top seeds are spread across groups.
            const topSeeds = [1, 2, 3, 4];
            const topGroups = topSeeds.map(s => groups.findIndex(g => g.includes(s)));
            assert.strictEqual(new Set(topGroups).size, 4);
        });

        it('should fall back to snake ordering for odd group counts', () => {
            const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
            const a = ordering['groups.bracket_optimized'](seeds, 3);
            const b = ordering['groups.seed_optimized'](seeds, 3);
            assert.deepStrictEqual(a, b);
        });

        it('should match the reference layout for 16 seeds and 4 groups', () => {
            const seeds = Array.from({ length: 16 }, (_, i) => i + 1);
            const result = ordering['groups.bracket_optimized'](seeds, 4);

            // Exact flattened layout by groups, left-to-right, top-to-bottom.
            assert.deepStrictEqual(result, [
                1, 7, 12, 14, // Group 1
                2, 8, 11, 13, // Group 2
                3, 5, 10, 16, // Group 3
                4, 6, 9, 15,  // Group 4
            ]);

            // And the grouped structure should be exactly these groups.
            assert.deepStrictEqual(makeGroups(result, 4), [
                [1, 7, 12, 14],
                [2, 8, 11, 13],
                [3, 5, 10, 16],
                [4, 6, 9, 15],
            ]);
        });
    });

    describe('Balance BYEs', () => {

        it('should ignore input BYEs in the seeding', () => {
            assert.deepStrictEqual(
                balanceByes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, null, null, null, null], 16),
                balanceByes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 16),
            );

            assert.deepStrictEqual(
                balanceByes([1, 2, 3, null, 4, 5, 6, 7, 8, null, 9, 10, null, 11, null, 12, null], 16),
                balanceByes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 16),
            );
        });

        it('should take the target size as an argument or calculate it', () => {
            assert.deepStrictEqual(
                balanceByes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 16),
                balanceByes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
            );
        });

        it('should prefer matches with only one BYE', () => {
            assert.deepStrictEqual(
                balanceByes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, null, null, null, null]),
                [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 10, null, 11, null, 12, null],
            );

            assert.deepStrictEqual(
                balanceByes([1, 2, 3, 4, 5, 6, 7, 8, null, null, null, null, null, null, null, null], 16),
                [1, null, 2, null, 3, null, 4, null, 5, null, 6, null, 7, null, 8, null],
            );

            assert.deepStrictEqual(
                balanceByes([1, 2, 3, 4, 5, 6, 7, null, null, null, null, null, null, null, null, null], 16),
                [1, null, 2, null, 3, null, 4, null, 5, null, 6, null, 7, null, null, null],
            );
        });
    });
});

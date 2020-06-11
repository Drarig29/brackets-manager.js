const assert = require('chai').assert;
const { makeGroups, assertRoundRobin, roundRobinMatches, ordering } = require('../dist/helpers');

describe('Helpers', () => {
    
    it('should place 8 participants with inner-outer method', () => {
        const teams = [1, 2, 3, 4, 5, 6, 7, 8];
        const placement = ordering['inner_outer'](teams);
        assert.deepEqual(placement, [
            1, 8,
            4, 5,
            2, 7,
            3, 6,
        ]);
    });

    it('should place 16 participants with inner-outer method', () => {
        const teams = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
        const placement = ordering['inner_outer'](teams);
        assert.deepEqual(placement, [
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

    it('should place participants in groups', () => {
        assert.deepEqual(makeGroups([1, 2, 3, 4, 5], 2), [[1, 2, 3], [4, 5]])
        assert.deepEqual(makeGroups([1, 2, 3, 4, 5, 6, 7, 8], 2), [[1, 2, 3, 4], [5, 6, 7, 8]])
        assert.deepEqual(makeGroups([1, 2, 3, 4, 5, 6, 7, 8], 3), [[1, 2, 3], [4, 5, 6], [7, 8]])
    });

    it('should make the rounds for a round-robin group', () => {
        assertRoundRobin(['t1', 't2', 't3'], roundRobinMatches(['t1', 't2', 't3']));
        assertRoundRobin([1, 2, 3, 4], roundRobinMatches([1, 2, 3, 4]));
        assertRoundRobin([1, 2, 3, 4, 5], roundRobinMatches([1, 2, 3, 4, 5]));
        assertRoundRobin([1, 2, 3, 4, 5, 6], roundRobinMatches([1, 2, 3, 4, 5, 6]));
    });

    it('should make a natural ordering', () => {
        assert.deepEqual(ordering["natural"]([1, 2, 3, 4, 5, 6, 7, 8]), [1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('should make a reverse ordering', () => {
        assert.deepEqual(ordering["reverse"]([1, 2, 3, 4, 5, 6, 7, 8]), [8, 7, 6, 5, 4, 3, 2, 1]);
    });

    it('should make a half shift ordering', () => {
        assert.deepEqual(ordering["half_shift"]([1, 2, 3, 4, 5, 6, 7, 8]), [5, 6, 7, 8, 1, 2, 3, 4]);
    });

    it('should make a reverse half shift ordering', () => {
        assert.deepEqual(ordering["reverse_half_shift"]([1, 2, 3, 4, 5, 6, 7, 8]), [4, 3, 2, 1, 8, 7, 6, 5]);
    });

    it('should make a pair flip ordering', () => {
        assert.deepEqual(ordering["pair_flip"]([1, 2, 3, 4, 5, 6, 7, 8]), [2, 1, 4, 3, 6, 5, 8, 7]);
    });

    it('should make an effort balanced ordering for groups', () => {
        assert.deepEqual(ordering["groups.effort_balanced"]([1, 2, 3, 4, 5, 6, 7, 8], 4), [
            1, 5, // 1st group
            2, 6, // 2nd group
            3, 7, // 3rd group
            4, 8, // 4th group
        ]);

        assert.deepEqual(ordering["groups.effort_balanced"]([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 4), [
            1, 5, 9, 13,  // 1st group
            2, 6, 10, 14, // 2nd group
            3, 7, 11, 15, // 3rd group
            4, 8, 12, 16, // 4th group
        ]);

        assert.deepEqual(ordering["groups.effort_balanced"]([1, 2, 3, 4, 5, 6, 7, 8], 2), [
            1, 3, 5, 7, // 1st group
            2, 4, 6, 8, // 2nd group
        ]);
    });

    it('should make a snake ordering for groups', () => {
        assert.deepEqual(ordering["groups.snake"]([1, 2, 3, 4, 5, 6, 7, 8], 4), [
            1, 8, // 1st group
            2, 7, // 2nd group
            3, 6, // 3rd group
            4, 5, // 4th group
        ]);

        assert.deepEqual(ordering["groups.snake"]([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 4), [
            1, 8, 9, 16,  // 1st group
            2, 7, 10, 15, // 2nd group
            3, 6, 11, 14, // 3rd group
            4, 5, 12, 13, // 4th group
        ]);

        assert.deepEqual(ordering["groups.snake"]([1, 2, 3, 4, 5, 6, 7, 8], 2), [
            1, 4, 5, 8, // 1st group
            2, 3, 6, 7, // 2nd group
        ]);
    });
});
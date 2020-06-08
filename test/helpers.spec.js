const assert = require('chai').assert;
const { innerOuterMethod, makeGroups, assertRoundRobin, roundRobinMatches } = require('../dist/helpers');

describe('Helpers', () => {
    it('should place 8 participants with inner-outer method', () => {
        const teams = [1, 2, 3, 4, 5, 6, 7, 8];
        const placement = innerOuterMethod(teams);
        assert.deepEqual(placement, [
            [1, 8],
            [4, 5],
            [2, 7],
            [3, 6],
        ]);
    });

    it('should place 16 participants with inner-outer method', () => {
        const teams = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
        const placement = innerOuterMethod(teams);
        assert.deepEqual(placement, [
            [1, 16],
            [8, 9],
            [4, 13],
            [5, 12],
            [2, 15],
            [7, 10],
            [3, 14],
            [6, 11],
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
});
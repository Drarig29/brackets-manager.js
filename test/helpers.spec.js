const assert = require('chai').assert;
const { innerOuterMethod, combinations, nonTrivialDivisors, upperMedianDivisor } = require('../dist/helpers');

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

    it('should create all possible combinations of 2 elements', () => {
        const teams = [1, 2, 3, 4];
        const matches = combinations(teams);
        assert.deepEqual(matches, [
            [1, 2], [1, 3], [1, 4],
            [2, 3], [2, 4], [3, 4],
        ]);
    });

    it('should get non trivial divisors of numbers', () => {
        assert.deepEqual(nonTrivialDivisors(1), []);
        assert.deepEqual(nonTrivialDivisors(2), []);
        assert.deepEqual(nonTrivialDivisors(4), [2]);
        assert.deepEqual(nonTrivialDivisors(10), [2, 5]);
        assert.deepEqual(nonTrivialDivisors(15), [3, 5]);
        assert.deepEqual(nonTrivialDivisors(36), [2, 3, 4, 6, 9, 12, 18]);
    });

    it('should get median divisor of numbers', () => {
        assert.deepEqual(upperMedianDivisor(2), 2);
        assert.deepEqual(upperMedianDivisor(6), 3);
        assert.deepEqual(upperMedianDivisor(10), 5);
        assert.deepEqual(upperMedianDivisor(15), 5);
        assert.deepEqual(upperMedianDivisor(36), 9);
        assert.deepEqual(upperMedianDivisor(45), 9);
    });
});
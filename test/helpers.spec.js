const assert = require('chai').assert;
const { innerOuterMethod } = require('../dist/helpers');

describe('Test participants placement', () => {
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
});
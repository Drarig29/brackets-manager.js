import { Stage, SeedOrdering, OrderingMap } from "brackets-model";
import * as fs from 'fs';

const viewerRoot = 'https://cdn.jsdelivr.net/gh/Drarig29/brackets-viewer.js/dist';

export function makeViewer(data: Stage) {
    const html = `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.5.1/jquery.slim.min.js"></script>

<link rel="stylesheet" href="${viewerRoot}/brackets-viewer.min.css" />
<script type="text/javascript" src="${viewerRoot}/brackets-viewer.min.js"></script>

<section class="tournament"></section>
<script>
    bracketsViewer.render(${JSON.stringify(data, null, 4)});
</script>`;

    fs.writeFileSync('viewer/viewer.html', html);
}

/**
 * Toornament's method to distribute seeds in the first round of single or double elimination.
 */
export function innerOuterMethod<T>(array: T[]): T[][] {
    const size = array.length / 4;
    const parts = {
        inner: [array.slice(size, 2 * size), array.slice(2 * size, 3 * size)],
        outer: [array.slice(0, size), array.slice(3 * size, 4 * size)]
    }

    function inner(part: T[][]): T[] {
        return [part[0].pop()!, part[1].shift()!];
    }

    function outer(part: T[][]): T[] {
        return [part[0].shift()!, part[1].pop()!];
    }

    const result: T[][] = [];

    for (let i = 0; i < size / 2; i++) {
        result.push(
            outer(parts.outer), // Outer's outer
            inner(parts.inner), // Inner's inner
            inner(parts.outer), // Outer's inner
            outer(parts.inner), // Inner's outer
        );
    }

    return result;
}

/**
 * Creates an array of possible combinations of 2 elements.
 */
export function combinations<T>(array: T[]): T[][] {
    const result: T[][] = []

    for (let i = 0; i < array.length - 1; i++)
        for (let j = i + 1; j < array.length; j++)
            result.push([array[i], array[j]]);

    return result;
}

/**
 * Gets divisors of n, without 1 and n.
 */
export function nonTrivialDivisors(n: number): number[] {
    const result: number[] = [];
    const limit = Math.sqrt(n);

    for (let i = 2; i <= limit; i++)
        if (n % i === 0)
            result.splice(result.length / 2, 0, ...(i === n / i ? [i] : [i, n / i]));

    return result;
}

/**
 * Returns the divisor which is the upper middle of the given number's divisors.
 */
export function upperMedianDivisor(n: number): number {
    const divisors = nonTrivialDivisors(n);
    return divisors[Math.ceil(divisors.length / 2)] || n;
}

export function makeGroups<T>(elements: T[], groupCount: number): T[][] {
    const groupSize = Math.ceil(elements.length / groupCount);
    const result: T[][] = [];

    for (let i = 0; i < elements.length; i++) {
        if (i % groupSize === 0)
            result.push([]);

        result[result.length - 1].push(elements[i]);
    }

    return result;
}

/**
 * Makes pairs with each element and its next one.
 * @example [1, 2, 3, 4] --> [[1, 2], [3, 4]]
 */
export function makePairs<T>(array: T[]): T[][];

/**
 * Makes pairs with one element from `left` and the other from `right`.
 * @example [1, 2] + [3, 4] --> [[1, 3], [2, 4]]
 */
export function makePairs<T>(left: T[], right: T[]): T[][];

export function makePairs<T>(left: T[], right?: T[]): T[][] {
    if (!right) {
        ensureEvenSized(left);
        return left.map((current, i) => (i % 2 === 0) ? [current, left[i + 1]] : [])
            .filter(v => v.length > 0);
    }

    ensureEquallySized(left, right);
    return left.map((current, i) => [current, right[i]]);
}

export function ensureEvenSized<T>(array: T[]) {
    if (array.length % 2 === 1) {
        throw Error('Array size must be even.');
    }
}

export function ensureEquallySized<T>(left: T[], right: T[]) {
    if (left.length !== right.length) {
        throw Error('Arrays size must be equal.');
    }
}

export function ensurePowerOfTwoSized<T>(array: T[]) {
    if (!Number.isInteger(Math.log2(array.length))) {
        throw Error('Array size must be a power of 2.');
    }
}

export function ensureNotTied(scores: number[]) {
    if (scores[0] === scores[1]) {
        throw Error(`${scores[0]} and ${scores[1]} are tied. It cannot be.`);
    }
}

// https://web.archive.org/web/20200601102344/https://tl.net/forum/sc2-tournaments/202139-superior-double-elimination-losers-bracket-seeding

export const ordering: OrderingMap = {
    'natural': <T>(array: T[]) => [...array],
    'reverse': <T>(array: T[]) => array.reverse(),
    'half_shift': <T>(array: T[]) => [...array.slice(array.length / 2), ...array.slice(0, array.length / 2)],
    'reverse_half_shift': <T>(array: T[]) => [...array.slice(array.length / 2).reverse(), ...array.slice(0, array.length / 2).reverse()],
    'pair_flip': <T>(array: T[]) => {
        const result: T[] = [];
        for (let i = 0; i < array.length; i += 2) result.push(array[i + 1], array[i]);
        return result;
    },
    'groups.effort_balanced': () => { throw Error('Not implemented.') },
    'groups.snake': () => { throw Error('Not implemented.') },
    'groups.bracket_optimized': () => { throw Error('Not implemented.') },
}

export const defaultMinorOrdering: { [key: number]: SeedOrdering[] } = {
    8: ['natural', 'reverse', 'natural'],
    16: ['natural', 'reverse_half_shift', 'reverse', 'natural'],
    32: ['natural', 'reverse', 'half_shift', 'natural', 'natural'],
    64: ['natural', 'reverse', 'half_shift', 'reverse', 'natural', 'natural'],
    128: ['natural', 'reverse', 'half_shift', 'pair_flip', 'pair_flip', 'pair_flip', 'natural'],
}
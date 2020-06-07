import { TournamentData } from "brackets-model/dist/types";
import * as fs from 'fs';

const viewerRoot = 'https://cdn.jsdelivr.net/gh/Drarig29/brackets-viewer.js/dist';

export function makeViewer(data: TournamentData) {
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
export function innerOuterMethod(array: any[]): any[][] {
    const size = array.length / 4;
    const parts = {
        inner: [array.slice(size, 2 * size), array.slice(2 * size, 3 * size)],
        outer: [array.slice(0, size), array.slice(3 * size, 4 * size)]
    }

    function inner(part: any[][]): any[] {
        return [part[0].pop()!, part[1].shift()!];
    }

    function outer(part: any[][]): any[] {
        return [part[0].shift()!, part[1].pop()!];
    }

    const result: any[][] = [];

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
export function combinations(array: any[]): any[][] {
    const result: any[][] = []

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

// TODO: refactor this with makePairs
// TODO: add generics everywhere... :)

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
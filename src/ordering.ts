// https://web.archive.org/web/20200601102344/https://tl.net/forum/sc2-tournaments/202139-superior-double-elimination-losers-bracket-seeding

import { SeedOrdering } from 'brackets-model';
import { OrderingMap } from './types';

export const ordering: OrderingMap = {
    'natural': <T>(array: T[]) => [...array],
    'reverse': <T>(array: T[]) => [...array].reverse(),
    'half_shift': <T>(array: T[]) => [...array.slice(array.length / 2), ...array.slice(0, array.length / 2)],
    'reverse_half_shift': <T>(array: T[]) => [...array.slice(0, array.length / 2).reverse(), ...array.slice(array.length / 2).reverse()],
    'pair_flip': <T>(array: T[]) => {
        const result: T[] = [];
        for (let i = 0; i < array.length; i += 2) result.push(array[i + 1], array[i]);
        return result;
    },
    'inner_outer': <T>(array: T[]) => {
        if (array.length === 2) return array;

        const participantCount = array.length;

        // Generate standard bracket seeding positions iteratively.
        let positions: number[] = [1, 2];
        while (positions.length < participantCount) {
            const size = positions.length * 2;
            const next: number[] = [];
            for (const pos of positions)
                next.push(pos, size + 1 - pos);
            positions = next;
        }

        const result: T[] = [];
        for (const pos of positions)
            result.push(array[pos - 1]);

        return result;
    },
    'groups.effort_balanced': <T>(array: T[], groupCount: number) => {
        const result: T[] = [];
        let i = 0, j = 0;

        while (result.length < array.length) {
            result.push(array[i]);
            i += groupCount;
            if (i >= array.length) i = ++j;
        }

        return result;
    },
    'groups.seed_optimized': <T>(array: T[], groupCount: number) => {
        const groups = Array.from({ length: groupCount }, (_): T[] => []);

        for (let run = 0; run < array.length / groupCount; run++) {
            if (run % 2 === 0) {
                for (let group = 0; group < groupCount; group++)
                    groups[group].push(array[run * groupCount + group]);

            } else {
                for (let group = 0; group < groupCount; group++)
                    groups[groupCount - group - 1].push(array[run * groupCount + group]);

            }
        }

        return groups.flat();
    },
    'groups.bracket_optimized': <T>(array: T[], groupCount: number) => {
        if (groupCount < 2)
            return [...array];

        // This method relies on pairing seeds as they would be matched in a
        // classic bracket (inner-outer). Then it distributes each pair across
        // two opposite groups so these opponents never end up in the same
        // round-robin group.

        // Require an even number of groups to strictly separate paired seeds.
        // If it's odd, fall back to the seed-optimized grouping which is the
        // closest sensible behavior.
        if (groupCount % 2 === 1)
            return ordering['groups.seed_optimized'](array, groupCount);

        const participantCount = array.length;
        const halfGroupCount = groupCount / 2;

        // Generate standard bracket seeding positions iteratively (1-based).
        let positions: number[] = [1, 2];
        while (positions.length < participantCount) {
            const size = positions.length * 2;
            const next: number[] = [];
            for (const pos of positions)
                next.push(pos, size + 1 - pos);
            positions = next;
        }

        // Helper that returns the base group index (0-based) for the first
        // element of the i-th pair in the bracket. The second element of the
        // pair goes to the opposite group (base + halfGroupCount).
        const baseGroupForPair = (i: number): number => {
            const t = i % halfGroupCount; // index inside the current block
            const r = Math.floor(i / halfGroupCount); // block index

            // Toggle orientation every two blocks to create a balanced snake
            // pattern across left and right halves of the groups.
            const inverted = Math.floor(r / 2) % 2 === 1;

            if (r % 2 === 0) {
                // Left half of groups: [0 .. half-1]
                return inverted ? (halfGroupCount - 1 - t) : t;
            }

            // Right half of groups: [groupCount-1 .. half]
            return inverted ? (halfGroupCount + t) : (groupCount - 1 - t);
        };

        const groups = Array.from({ length: groupCount }, (): T[] => []);

        const pairCount = Math.floor(positions.length / 2);

        // First, distribute the first element of each pair to its base group
        // to keep the strongest seeds spread nicely.
        for (let i = 0; i < pairCount; i++) {
            const base = baseGroupForPair(i);
            const aIndex = positions[2 * i] - 1; // convert to 0-based
            groups[base].push(array[aIndex]);
        }

        // Then, distribute the second element of each pair to the opposite
        // group to avoid having bracket-opponents in the same group.
        for (let i = 0; i < pairCount; i++) {
            const base = baseGroupForPair(i);
            const bIndex = positions[2 * i + 1] - 1; // convert to 0-based
            groups[(base + halfGroupCount) % groupCount].push(array[bIndex]);
        }

        // Sort each group by original seed order so the strongest seed of the
        // group appears first, matching common UI expectations and the
        // reference layout.
        const indexByItem = new Map<T, number>(array.map((v, i) => [v, i]));
        for (const g of groups)
            g.sort((a, b) => (indexByItem.get(a)! - indexByItem.get(b)!));

        return groups.flat();
    },
};

export const defaultMinorOrdering: { [key: number]: SeedOrdering[] } = {
    // 1 or 2: Not possible.
    4: ['natural', 'reverse'],
    8: ['natural', 'reverse', 'natural'],
    16: ['natural', 'reverse_half_shift', 'reverse', 'natural'],
    32: ['natural', 'reverse', 'half_shift', 'natural', 'natural'],
    64: ['natural', 'reverse', 'half_shift', 'reverse', 'natural', 'natural'],
    128: ['natural', 'reverse', 'half_shift', 'pair_flip', 'pair_flip', 'pair_flip', 'natural'],
};

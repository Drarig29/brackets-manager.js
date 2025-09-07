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
    'groups.bracket_optimized': () => {
        throw Error('Not implemented.');
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

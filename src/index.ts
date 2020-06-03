create("double_elimination", [
    "Team 1", "Team 2",
    "Team 3", "Team 4",
    "Team 5", "Team 6",
    "Team 7", "Team 8",
    "Team 9", "Team 10",
    "Team 11", "Team 12",
    "Team 13", "Team 14",
    "Team 15", "Team 16",
]);

function create(type: TournamentType, teams: string[]) {
    if (type === "double_elimination") {
        createDoubleElimination(teams);
    }
}

function createDoubleElimination(teams: string[]) {
    const roundCount = Math.log2(teams.length);

    for (let i = 0; i < roundCount; i++) {
        console.log(i);
    }
}

const ordering = {
    natural: (array: any[]) => [...array],
    reverse: (array: any[]) => array.reverse(),
    half_shift: (array: any[]) => [...array.slice(array.length / 2), ...array.slice(0, array.length / 2)],
    reverse_half_shift: (array: any[]) => [...array.slice(array.length / 2).reverse(), ...array.slice(0, array.length / 2).reverse()],
    pair_flip: (array: any[]) => {
        const result = [];
        for (let i = 0; i < array.length; i += 2) result.push(array[i + 1], array[i]);
        return result;
    },
}

const defaultMinorOrdering: { [key: number]: OrderingType[] } = {
    8: ['natural', 'reverse', 'natural'],
    16: ['natural', 'reverse_half_shift', 'reverse', 'natural'],
    32: ['natural', 'reverse', 'half_shift', 'natural', 'natural'],
    64: ['natural', 'reverse', 'half_shift', 'reverse', 'natural', 'natural'],
    128: ['natural', 'reverse', 'half_shift', 'pair_flip', 'pair_flip', 'pair_flip', 'natural'],
}
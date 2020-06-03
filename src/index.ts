import { makePairs } from 'brackets-model';
import { Tournament, Teams } from 'brackets-model/dist/types'

create({
    name: 'Example',
    minorOrdering: ['reverse', 'pair_flip', 'reverse', 'natural'],
    type: 'double_elimination',
    teams: [
        'Team 1', 'Team 2',
        'Team 3', 'Team 4',
        'Team 5', 'Team 6',
        'Team 7', 'Team 8',
        'Team 9', 'Team 10',
        'Team 11', 'Team 12',
        'Team 13', 'Team 14',
        'Team 15', 'Team 16',
    ],
});

function create(tournament: Tournament) {
    if (tournament.type === 'double_elimination') {
        createDoubleElimination(tournament.teams);
    }
}

function createDoubleElimination(teams: Teams) {
    const roundCount = Math.log2(teams.length);

    for (let i = roundCount - 1; i >= 0; i--) {
        const matchCount = Math.pow(2, i);

        if (i === roundCount - 1)
            createRound(matchCount, teams);
        else
            createRound(matchCount, []);
    }
}

function createRound(count: number, teams: Teams) {
    const allOpponents = makePairs(teams);

    for (let i = 0; i < count; i++) {
        createMatch(allOpponents[i]);
    }
}

function createMatch(opponents?: Teams) {
    opponents && console.log(opponents);
}
import { makePairs } from 'brackets-model';
import { Tournament, Teams } from 'brackets-model/dist/types';
import { db } from './database';

export function createStage(stage: Tournament) {
    if (stage.type === 'double_elimination') {
        const stageId = db.insert('stage', {
            name: stage.name,
            type: stage.type,
        });

        createDoubleElimination(stageId, stage.teams);
    }
}

function createDoubleElimination(stageId: number, teams: Teams) {
    createWinnerBracket(stageId, teams);
    createLoserBracket(stageId, teams);
    createGrandFinal(stageId);
}

function createWinnerBracket(stageId: number, teams: Teams) {
    const roundCount = Math.log2(teams.length);
    const groupId = db.insert('group', {
        stage_id: stageId,
        name: 'Winner Bracket',
    });

    let number = 1;

    for (let i = roundCount - 1; i >= 0; i--) {
        const matchCount = Math.pow(2, i);

        if (i === roundCount - 1)
            createRound(stageId, groupId, number++, matchCount, teams);
        else
            createRound(stageId, groupId, number++, matchCount, []);
    }
}

function createLoserBracket(stageId: number, teams: Teams) {
    const majorRoundCount = Math.log2(teams.length) - 1;

    const groupId = db.insert('group', {
        stage_id: stageId,
        name: 'Loser Bracket',
    });

    let number = 1;

    for (let i = majorRoundCount - 1; i >= 0; i--) {
        const matchCount = Math.pow(2, i);
        createRound(stageId, groupId, number++, matchCount, []);
        createRound(stageId, groupId, number++, matchCount, []);
    }
}

function createGrandFinal(stageId: number) {
    const groupId = db.insert('group', {
        stage_id: stageId,
        name: 'Grand Final',
    });

    createRound(stageId, groupId, 1, 1, []);
}

function createRound(stageId: number, groupId: number, roundNumber: number, matchCount: number, teams: Teams) {
    const allOpponents = makePairs(teams);
    const roundId = db.insert('round', {
        number: roundNumber,
        stage_id: stageId,
        group_id: groupId,
    });

    for (let i = 0; i < matchCount; i++) {
        createMatch(stageId, groupId, roundId, i + 1, allOpponents[i]);
    }
}

function createMatch(stageId: number, groupId: number, roundId: number, matchNumber: number, opponents?: Teams) {
    db.insert('match', {
        number: matchNumber,
        stage_id: stageId,
        group_id: groupId,
        round_id: roundId,
        status: 'pending',
        team1: opponents ? {
            name: opponents[0]
        } : null,
        team2: opponents ? {
            name: opponents[1]
        } : null,
    });
}
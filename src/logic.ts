import { makePairs } from 'brackets-model';
import { Tournament, Teams } from 'brackets-model/dist/types'
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
}

function createWinnerBracket(stageId: number, teams: Teams) {
    const roundCount = Math.log2(teams.length);
    const groupId = db.insert('group', {
        stage_id: stageId,
        name: 'Winner Bracket',
    });

    for (let i = roundCount - 1; i >= 0; i--) {
        const matchCount = Math.pow(2, i);

        if (i === roundCount - 1)
            createRound(stageId, groupId, matchCount, teams);
        else
            createRound(stageId, groupId, matchCount, []);
    }
}

function createLoserBracket(stageId: number, teams: Teams) {
    const majorRoundCount = Math.log2(teams.length) - 1;

    const groupId = db.insert('group', {
        stage_id: stageId,
        name: 'Loser Bracket',
    });

    for (let i = majorRoundCount - 1; i >= 0; i--) {
        const matchCount = Math.pow(2, i);
        createRound(stageId, groupId, matchCount, []);
    }
}

function createRound(stageId: number, groupId: number, count: number, teams: Teams) {
    const allOpponents = makePairs(teams);
    const roundId = db.insert('round', {
        stage_id: stageId,
        group_id: groupId,
    });

    for (let i = 0; i < count; i++) {
        createMatch(stageId, groupId, roundId, allOpponents[i]);
    }
}

function createMatch(stageId: number, groupId: number, roundId: number, opponents?: Teams) {
    db.insert('match', {
        stage_id: stageId,
        group_id: groupId,
        round_id: roundId,
        status: 'pending',
        team1: opponents ? opponents[0] : null,
        team2: opponents ? opponents[1] : null,
    });
}
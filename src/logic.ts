import { makePairs } from 'brackets-model';
import { Tournament, Teams, TournamentData, TournamentResults, BracketScores, RoundScores, MatchScores } from 'brackets-model/dist/types'
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
        stage_id: stageId,
        group_id: groupId,
        number: roundNumber,
    });

    for (let i = 0; i < matchCount; i++) {
        createMatch(stageId, groupId, roundId, allOpponents[i]);
    }
}

function createMatch(stageId: number, groupId: number, roundId: number, opponents?: Teams) {
    db.insert('match', {
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

export function exportToViewer(stageId: number): TournamentData {
    const stage = db.select('stage', stageId);
    const groups = db.select('group', group => group.stage_id === stageId);
    const rounds = db.select('round', round => db.isIn(round.group_id, groups));
    const matches = db.select('match', match => db.isIn(match.round_id, rounds));

    const winnerBracket = groups.filter(group => group.name === 'Winner Bracket')[0];
    const firstRound = rounds.filter(round => round.group_id === winnerBracket.id && round.number === 1)[0];
    const knownMatches = matches.filter(match => match.round_id === firstRound.id);

    const teams: Teams = [];

    knownMatches.map(match => {
        teams.push(match.team1.name);
        teams.push(match.team2.name);
    });

    const results: TournamentResults = [];

    for (const group of groups) {
        const groupScores: BracketScores = [];

        for (const round of rounds.filter(r => r.group_id === group.id)) {
            const roundScores: RoundScores = [];

            for (const match of matches.filter(m => m.round_id === round.id)) {
                const matchScores: MatchScores = [
                    // TODO: change those hardcoded values!
                    match.team1 ? match.team1.score || 1 : 1,
                    match.team2 ? match.team2.score || 0 : 0,
                ];
                roundScores.push(matchScores);
            }
            groupScores.push(roundScores);
        }
        results.push(groupScores);
    }

    return {
        name: stage.name,
        type: stage.type,
        teams,
        results
    };
}
import { makePairs } from 'brackets-model';
import { Tournament } from 'brackets-model/dist/types';
import { db } from './database';

type Team = { name: string | null } | null;
type Opponents = Team[];
type Teams = Opponents[];

export function createStage(stage: Tournament) {
    const stageId = db.insert('stage', {
        name: stage.name,
        type: stage.type,
    });

    // TODO: correct the model to support null (BYE) in teams.

    switch (stage.type) {
        case 'single_elimination':
            createSingleElimination(stageId, (stage.teams as string[]));
            break;
        case 'double_elimination':
            createDoubleElimination(stageId, (stage.teams as string[]));
            break;
        default:
            throw Error('Unknown stage type.');
    }
}

function createSingleElimination(stageId: number, inputTeams: string[]) {
    const teams = inputToTeams(inputTeams);
    createStandardBracket('Bracket', stageId, teams);
}

function createDoubleElimination(stageId: number, inputTeams: string[]) {
    const teams = inputToTeams(inputTeams);
    const { losers: losersWb, winner: winnerWb } = createStandardBracket('Winner Bracket', stageId, teams);
    const winnerLb = createMajorMinorBracket('Loser Bracket', stageId, losersWb);
    createConstantSizeBracket('Grand Final', stageId, [[winnerWb, winnerLb]]);
}

function createStandardBracket(name: string, stageId: number, teams: Teams): {
    losers: Team[][],
    winner: Team,
} {
    const roundCount = Math.log2(teams.length * 2);
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    let number = 1;
    const losers: Team[][] = [];

    for (let i = roundCount - 1; i >= 0; i--) {
        const matchCount = Math.pow(2, i);
        teams = getCurrentTeams(teams, matchCount);
        createRound(stageId, groupId, number++, matchCount, teams);
        losers.push(teams.map(byePropagation));
    }

    const winner = byeResult(teams[0]);
    return { losers, winner };
}

function createMajorMinorBracket(name: string, stageId: number, losers: Team[][]): Team {
    const majorRoundCount = losers.length - 1;
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    let losersId = 0;
    let teams = makePairs(losers[losersId++]);
    let number = 1;

    for (let i = majorRoundCount - 1; i >= 0; i--) {
        const matchCount = Math.pow(2, i);

        // Major round.
        teams = getCurrentTeams(teams, matchCount, true);
        createRound(stageId, groupId, number++, matchCount, teams);

        // Minor round.
        teams = getCurrentTeams(teams, matchCount, false, losers[losersId++]);
        createRound(stageId, groupId, number++, matchCount, teams);
    }

    return byeResult(teams[0]); // Winner.
}

function createConstantSizeBracket(name: string, stageId: number, teams: Teams) {
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    // TODO: add double grand final.
    createRound(stageId, groupId, 1, 1, teams);
}

function createRound(stageId: number, groupId: number, roundNumber: number, matchCount: number, teams: Teams) {
    const roundId = db.insert('round', {
        number: roundNumber,
        stage_id: stageId,
        group_id: groupId,
    });

    for (let i = 0; i < matchCount; i++) {
        createMatch(stageId, groupId, roundId, i + 1, teams[i]);
    }
}

function createMatch(stageId: number, groupId: number, roundId: number, matchNumber: number, opponents: Opponents) {
    db.insert('match', {
        number: matchNumber,
        stage_id: stageId,
        group_id: groupId,
        round_id: roundId,
        status: 'pending',
        team1: opponents[0],
        team2: opponents[1],
    });
}

function getCurrentTeams(prevTeams: Teams, currentMatchCount: number): Teams;
function getCurrentTeams(prevTeams: Teams, currentMatchCount: number, major: true): Teams;
function getCurrentTeams(prevTeams: Teams, currentMatchCount: number, major: false, losers: Team[]): Teams;

function getCurrentTeams(prevTeams: Teams, currentMatchCount: number, major?: boolean, losers?: Team[]): Teams {
    if ((major === undefined || major === true) && prevTeams.length === currentMatchCount) return prevTeams; // First round.

    const currentTeams: Teams = [];

    if (major === undefined || major === true) { // From major to major (WB) or minor to major (LB).
        for (let matchId = 0; matchId < currentMatchCount; matchId++) {
            const prevMatchId = matchId * 2;
            currentTeams.push([
                byeResult(prevTeams[prevMatchId + 0]), // team1.
                byeResult(prevTeams[prevMatchId + 1]), // team2.
            ]);
        }
    } else { // From major to minor (LB).
        for (let matchId = 0; matchId < currentMatchCount; matchId++) {
            const prevMatchId = matchId;
            currentTeams.push([
                byeResult(prevTeams[prevMatchId]), // team1.
                losers![prevMatchId], // team2.
            ]);
        }
    }

    return currentTeams;
}

function inputToTeams(input: string[]): Teams {
    return makePairs(input.map(team => team ? { name: team } : null));
}

function byeResult(opponents: Opponents): Team {
    if (opponents[0] === null && opponents[1] === null) // Double BYE.
        return null; // BYE.

    if (opponents[0] === null && opponents[1] !== null) // team1 BYE.
        return { name: opponents[1]!.name }; // team2.

    if (opponents[0] !== null && opponents[1] === null) // team2 BYE.
        return { name: opponents[0]!.name }; // team1.

    return { name: null }; // Normal.
}

function byePropagation(opponents: Opponents): Team {
    if (opponents[0] === null || opponents[1] === null) // At least one BYE.
        return null; // BYE.

    return { name: null }; // Normal.
}
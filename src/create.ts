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
    // TODO: propagate BYEs through the different brackets.
    const teams = inputToTeams(inputTeams);
    createStandardBracket('Winner Bracket', stageId, teams);
    createMajorMinorBracket('Loser Bracket', stageId, teams);
    createConstantSizeBracket('Grand Final', stageId, [[{ name: null }, { name: null }]]);
}

function createStandardBracket(name: string, stageId: number, teams: Teams) {
    const roundCount = Math.log2(teams.length * 2);
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    let number = 1;

    for (let i = roundCount - 1; i >= 0; i--) {
        const matchCount = Math.pow(2, i);
        teams = propagateByes(teams, matchCount);
        createRound(stageId, groupId, number++, matchCount, teams);
    }
}

function createMajorMinorBracket(name: string, stageId: number, teams: Teams) {
    const majorRoundCount = Math.log2(teams.length * 2) - 1;
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    let number = 1;
    
    // TODO: Test BYE propagation with minor rounds...
    
    for (let i = majorRoundCount - 1; i >= 0; i--) {
        const matchCount = Math.pow(2, i);

        // Major round.
        teams = propagateByes(teams, matchCount);
        createRound(stageId, groupId, number++, matchCount, teams);

        // Minor round.
        teams = propagateByes(teams, matchCount);
        createRound(stageId, groupId, number++, matchCount, teams);
    }
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

function propagateByes(prevTeams: Teams, currentMatchCount: number): Teams {
    if (prevTeams.length === currentMatchCount) return prevTeams; // First round

    const currentTeams = Array(currentMatchCount);

    function propagateInTeam(prevMatchId: number, currMatchId: number, side: number) {
        const opponents = prevTeams[prevMatchId + side];

        if (opponents[0] === null && opponents[1] === null)  // Double BYE.
            currentTeams[currMatchId][side] = null; // BYE.

        if (opponents[0] !== null && opponents[1] !== null)  // No BYE.
            currentTeams[currMatchId][side] = { name: null }; // Normal.

        if (opponents[0] === null && opponents[1] !== null)  // team1 BYE.
            currentTeams[currMatchId][side] = { name: opponents[1]!.name }; // team2.

        if (opponents[0] !== null && opponents[1] === null)  // team2 BYE.
            currentTeams[currMatchId][side] = { name: opponents[0]!.name };; // team1.
    }

    for (let matchId = 0; matchId < currentMatchCount; matchId++) {
        const prevRoundId = matchId * 2;
        currentTeams[matchId] = Array(2);
        propagateInTeam(prevRoundId, matchId, 0); // team1
        propagateInTeam(prevRoundId, matchId, 1); // team2
    }

    return currentTeams;
}

function inputToTeams(input: string[]): Teams {
    return makePairs(input.map(team => team ? { name: team } : null));
}
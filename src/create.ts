import { Stage, InputParticipants, Participant, Duels, Duel } from 'brackets-model';
import { db } from './database';
import { combinations, upperMedianDivisor, makeGroups, makePairs } from './helpers';

export function createStage(stage: Stage) {
    const stageId = db.insert('stage', {
        name: stage.name,
        type: stage.type,
    });

    switch (stage.type) {
        case 'round_robin':
            createRoundRobin(stageId, stage.participants, 2);
            break;
        case 'single_elimination':
            createSingleElimination(stageId, stage.participants);
            break;
        case 'double_elimination':
            createDoubleElimination(stageId, stage.participants);
            break;
        default:
            throw Error('Unknown stage type.');
    }
}

function createRoundRobin(stageId: number, inputTeams: InputParticipants, groupCount: number) {
    const teams: Participant[] = inputTeams.map(team => team ? { name: team } : null);
    const groups = makeGroups(teams, groupCount);

    for (let i = 0; i < groups.length; i++)
        createGroup(`Group ${i + 1}`, stageId, groups[i]);
}

function createGroup(name: string, stageId: number, teams: Participant[]) {
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    const matches: Duels = combinations(teams);
    const matchCount = matches.length;
    const roundCount = upperMedianDivisor(matchCount);
    const matchesPerRound = matchCount / roundCount;

    for (let i = 0; i < roundCount; i++)
        createRound(stageId, groupId, i + 1, matchesPerRound, matches.slice(i * matchesPerRound, (i + 1) * matchesPerRound))
}

function createSingleElimination(stageId: number, inputTeams: InputParticipants) {
    const teams = inputToTeams(inputTeams);
    createStandardBracket('Bracket', stageId, teams);
}

function createDoubleElimination(stageId: number, inputTeams: InputParticipants) {
    const teams = inputToTeams(inputTeams);
    const { losers: losersWb, winner: winnerWb } = createStandardBracket('Winner Bracket', stageId, teams);
    const winnerLb = createMajorMinorBracket('Loser Bracket', stageId, losersWb);
    createConstantSizeBracket('Grand Final', stageId, [[winnerWb, winnerLb]]);
}

function createStandardBracket(name: string, stageId: number, teams: Duels): {
    losers: Participant[][],
    winner: Participant,
} {
    const roundCount = Math.log2(teams.length * 2);
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    let number = 1;
    const losers: Participant[][] = [];

    for (let i = roundCount - 1; i >= 0; i--) {
        const matchCount = Math.pow(2, i);
        teams = getCurrentTeams(teams, matchCount);
        createRound(stageId, groupId, number++, matchCount, teams);
        losers.push(teams.map(byePropagation));
    }

    const winner = byeResult(teams[0]);
    return { losers, winner };
}

function createMajorMinorBracket(name: string, stageId: number, losers: Participant[][]): Participant {
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

function createConstantSizeBracket(name: string, stageId: number, teams: Duels) {
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    // TODO: add double grand final.
    createRound(stageId, groupId, 1, 1, teams);
}

function createRound(stageId: number, groupId: number, roundNumber: number, matchCount: number, teams: Duels) {
    const roundId = db.insert('round', {
        number: roundNumber,
        stage_id: stageId,
        group_id: groupId,
    });

    for (let i = 0; i < matchCount; i++) {
        createMatch(stageId, groupId, roundId, i + 1, teams[i]);
    }
}

function createMatch(stageId: number, groupId: number, roundId: number, matchNumber: number, opponents: Duel) {
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

function getCurrentTeams(prevTeams: Duels, currentMatchCount: number): Duels;
function getCurrentTeams(prevTeams: Duels, currentMatchCount: number, major: true): Duels;
function getCurrentTeams(prevTeams: Duels, currentMatchCount: number, major: false, losers: Participant[]): Duels;

function getCurrentTeams(prevTeams: Duels, currentMatchCount: number, major?: boolean, losers?: Participant[]): Duels {
    if ((major === undefined || major === true) && prevTeams.length === currentMatchCount) return prevTeams; // First round.

    const currentTeams: Duels = [];

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

function inputToTeams(input: InputParticipants): Duels {
    return makePairs(input.map<Participant>(team => team ? { name: team } : null));
}

function byeResult(opponents: Duel): Participant {
    if (opponents[0] === null && opponents[1] === null) // Double BYE.
        return null; // BYE.

    if (opponents[0] === null && opponents[1] !== null) // team1 BYE.
        return { name: opponents[1]!.name }; // team2.

    if (opponents[0] !== null && opponents[1] === null) // team2 BYE.
        return { name: opponents[0]!.name }; // team1.

    return { name: null }; // Normal.
}

function byePropagation(opponents: Duel): Participant {
    if (opponents[0] === null || opponents[1] === null) // At least one BYE.
        return null; // BYE.

    return { name: null }; // Normal.
}
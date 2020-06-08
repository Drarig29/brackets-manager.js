import { InputParticipants, Participant, Duels, Duel, InputStage } from 'brackets-model';
import { makeGroups, makePairs, roundRobinMatches } from './helpers';
import { db } from './database';

let actualTeams: { [name: string]: { id: number, name: string } } = {};

export function createStage(stage: InputStage) {
    actualTeams = Object.fromEntries(stage.participants.filter(name => name !== null).map((name, id) => [name, { id, name }]));

    switch (stage.type) {
        case 'round_robin':
            createRoundRobin(stage);
            break;
        case 'single_elimination':
            createSingleElimination(stage);
            break;
        case 'double_elimination':
            createDoubleElimination(stage);
            break;
        default:
            throw Error('Unknown stage type.');
    }

    db.insertAll('team', Object.values(actualTeams));
}

function createRoundRobin(stage: InputStage) {
    if (!stage.settings || !stage.settings.groupCount) throw Error('You must specify a group count for round-robin stages.');

    const stageId = db.insert('stage', {
        name: stage.name,
        type: stage.type,
    });

    const teams: Participant[] = stage.participants.map<Participant>(team => team ? { name: team } : null);
    const groups = makeGroups(teams, stage.settings.groupCount);

    for (let i = 0; i < groups.length; i++)
        createGroup(`Group ${i + 1}`, stageId, groups[i]);
}

function createSingleElimination(stage: InputStage) {
    const stageId = db.insert('stage', {
        name: stage.name,
        type: stage.type,
    });

    const duels = inputToDuels(stage.participants);
    const { losers } = createStandardBracket('Bracket', stageId, duels);

    const semiFinalLosers = losers[losers.length - 2];
    if (stage.settings && stage.settings.consolationFinal)
        createUniqueMatchBracket('Consolation Final', stageId, [semiFinalLosers]);
}

function createDoubleElimination(stage: InputStage) {
    const stageId = db.insert('stage', {
        name: stage.name,
        type: stage.type,
    });

    const duels = inputToDuels(stage.participants);
    const { losers: losersWb, winner: winnerWb } = createStandardBracket('Winner Bracket', stageId, duels);
    const winnerLb = createMajorMinorBracket('Loser Bracket', stageId, losersWb);

    // Simple Grand Final by default.
    const grandFinal = (stage.settings && stage.settings.grandFinal) || 'simple';

    if (grandFinal === 'simple') {
        createUniqueMatchBracket('Grand Final', stageId, [
            [winnerWb, winnerLb]
        ]);
    }
    else if (grandFinal === 'double') {
        createUniqueMatchBracket('Grand Final', stageId, [
            [winnerWb, winnerLb],
            [{ name: null }, { name: null }] // Won't be shown if the WB winner wins the first time.
        ]);
    }
}

function createGroup(name: string, stageId: number, teams: Participant[]) {
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    const rounds = roundRobinMatches(teams);

    for (let i = 0; i < rounds.length; i++)
        createRound(stageId, groupId, i + 1, rounds[0].length, rounds[i]);
}

function createStandardBracket(name: string, stageId: number, duels: Duels): {
    losers: Participant[][],
    winner: Participant,
} {
    const roundCount = Math.log2(duels.length * 2);
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    let number = 1;
    const losers: Participant[][] = [];

    for (let i = roundCount - 1; i >= 0; i--) {
        const matchCount = Math.pow(2, i);
        duels = getCurrentDuels(duels, matchCount);
        createRound(stageId, groupId, number++, matchCount, duels);
        losers.push(duels.map(byePropagation));
    }

    const winner = byeResult(duels[0]);
    return { losers, winner };
}

function createMajorMinorBracket(name: string, stageId: number, losers: Participant[][]): Participant {
    const majorRoundCount = losers.length - 1;
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    let losersId = 0;
    let duels = makePairs(losers[losersId++]);
    let number = 1;

    for (let i = majorRoundCount - 1; i >= 0; i--) {
        const matchCount = Math.pow(2, i);

        // Major round.
        duels = getCurrentDuels(duels, matchCount, true);
        createRound(stageId, groupId, number++, matchCount, duels);

        // Minor round.
        duels = getCurrentDuels(duels, matchCount, false, losers[losersId++]);
        createRound(stageId, groupId, number++, matchCount, duels);
    }

    return byeResult(duels[0]); // Winner.
}

/**
 * Creates a bracket with rounds that only have 1 match each.
 */
function createUniqueMatchBracket(name: string, stageId: number, duels: Duels) {
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    for (let i = 0; i < duels.length; i++)
        createRound(stageId, groupId, i + 1, 1, [duels[i]]);
}

function createRound(stageId: number, groupId: number, roundNumber: number, matchCount: number, duels: Duels) {
    const roundId = db.insert('round', {
        number: roundNumber,
        stage_id: stageId,
        group_id: groupId,
    });

    for (let i = 0; i < matchCount; i++)
        createMatch(stageId, groupId, roundId, i + 1, duels[i]);
}

function createMatch(stageId: number, groupId: number, roundId: number, matchNumber: number, opponents: Duel) {
    db.insert('match', {
        number: matchNumber,
        stage_id: stageId,
        group_id: groupId,
        round_id: roundId,
        status: 'pending',
        opponent1: opponents[0] ? {
            id: opponents[0].name ? actualTeams[opponents[0].name].id : null
        } : null,
        opponent2: opponents[1] ? {
            id: opponents[1].name ? actualTeams[opponents[1].name].id : null
        } : null,
    });
}

function getCurrentDuels(prevDuels: Duels, currentMatchCount: number): Duels;
function getCurrentDuels(prevDuels: Duels, currentMatchCount: number, major: true): Duels;
function getCurrentDuels(prevDuels: Duels, currentMatchCount: number, major: false, losers: Participant[]): Duels;

function getCurrentDuels(prevDuels: Duels, currentMatchCount: number, major?: boolean, losers?: Participant[]): Duels {
    if ((major === undefined || major === true) && prevDuels.length === currentMatchCount) return prevDuels; // First round.

    const currentDuels: Duels = [];

    if (major === undefined || major === true) { // From major to major (WB) or minor to major (LB).
        for (let matchId = 0; matchId < currentMatchCount; matchId++) {
            const prevMatchId = matchId * 2;
            currentDuels.push([
                byeResult(prevDuels[prevMatchId + 0]), // opponent1.
                byeResult(prevDuels[prevMatchId + 1]), // opponent2.
            ]);
        }
    } else { // From major to minor (LB).
        for (let matchId = 0; matchId < currentMatchCount; matchId++) {
            const prevMatchId = matchId;
            currentDuels.push([
                byeResult(prevDuels[prevMatchId]), // opponent1.
                losers![prevMatchId], // opponent2.
            ]);
        }
    }

    return currentDuels;
}

function inputToDuels(input: InputParticipants): Duels {
    return makePairs(input.map<Participant>(team => team ? { name: team } : null));
}

function byeResult(opponents: Duel): Participant {
    if (opponents[0] === null && opponents[1] === null) // Double BYE.
        return null; // BYE.

    if (opponents[0] === null && opponents[1] !== null) // opponent1 BYE.
        return { name: opponents[1]!.name }; // opponent2.

    if (opponents[0] !== null && opponents[1] === null) // opponent2 BYE.
        return { name: opponents[0]!.name }; // opponent1.

    return { name: null }; // Normal.
}

function byePropagation(opponents: Duel): Participant {
    if (opponents[0] === null || opponents[1] === null) // At least one BYE.
        return null; // BYE.

    return { name: null }; // Normal.
}
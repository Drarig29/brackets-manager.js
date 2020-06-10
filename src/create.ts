import { InputParticipants, Participant, Duels, Duel, InputStage, ParticipantSlot, Match, ParticipantResult, SeedOrdering, StageSettings, MatchGame } from 'brackets-model';
import { db } from './database';
import * as helpers from './helpers';

export function createStage(stage: InputStage) {
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
}

function createRoundRobin(stage: InputStage) {
    if (!stage.settings || !stage.settings.groupCount) throw Error('You must specify a group count for round-robin stages.');

    if (Array.isArray(stage.settings.seedOrdering)
        && stage.settings.seedOrdering.length !== 1) throw Error('You must specify one seed ordering method.');

    // Default method for groups: Effort balanced.
    const method = getOrdering(stage.settings, 0, 'groups') || 'groups.effort_balanced';
    const stageId = db.insert('stage', {
        name: stage.name,
        type: stage.type,
    });

    const slots = registerParticipants(stage.participants);
    const ordered: ParticipantSlot[] = helpers.ordering[method](slots, stage.settings.groupCount);

    const groups = helpers.makeGroups(ordered, stage.settings.groupCount);

    for (let i = 0; i < groups.length; i++)
        createGroup(`Group ${i + 1}`, stageId, groups[i], stage.settings);
}

function createSingleElimination(stage: InputStage) {
    if (stage.settings && Array.isArray(stage.settings.seedOrdering) &&
        stage.settings.seedOrdering.length !== 1) throw Error('You must specify one seed ordering method.');

    // Default method for single elimination: Inner outer.
    const method = getOrdering(stage.settings, 0, 'elimination') || 'inner_outer';
    const stageId = db.insert('stage', {
        name: stage.name,
        type: stage.type,
    });

    const slots = registerParticipants(stage.participants);
    const ordered: ParticipantSlot[] = helpers.ordering[method](slots);
    const duels = helpers.makePairs(ordered);

    const { losers } = createStandardBracket('Bracket', stageId, duels, stage.settings);

    const semiFinalLosers = losers[losers.length - 2];
    if (stage.settings && stage.settings.consolationFinal)
        createUniqueMatchBracket('Consolation Final', stageId, [semiFinalLosers], stage.settings);
}

function createDoubleElimination(stage: InputStage) {
    if (stage.settings && Array.isArray(stage.settings.seedOrdering) &&
        stage.settings.seedOrdering.length < 1) throw Error('You must specify at least one seed ordering method.');

    // Default method for WB: Inner outer.
    const method = getOrdering(stage.settings, 0, 'elimination') || 'inner_outer';
    const stageId = db.insert('stage', {
        name: stage.name,
        type: stage.type,
    });

    const slots = registerParticipants(stage.participants);
    const ordered: ParticipantSlot[] = helpers.ordering[method](slots);
    const duels = helpers.makePairs(ordered);

    const { losers: losersWb, winner: winnerWb } = createStandardBracket('Winner Bracket', stageId, duels, stage.settings);
    const winnerLb = createMajorMinorBracket('Loser Bracket', stageId, losersWb, stage.settings);

    // Simple Grand Final by default.
    const grandFinal = (stage.settings && stage.settings.grandFinal) || 'simple';

    if (grandFinal === 'simple') {
        createUniqueMatchBracket('Grand Final', stageId, [
            [winnerWb, winnerLb]
        ], stage.settings);
    } else if (grandFinal === 'double') {
        createUniqueMatchBracket('Grand Final', stageId, [
            [winnerWb, winnerLb],
            [{ id: null }, { id: null }] // Won't be shown if the WB winner wins the first time.
        ], stage.settings);
    }
}

function createGroup(name: string, stageId: number, slots: ParticipantSlot[], settings: StageSettings | undefined) {
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    const rounds = helpers.roundRobinMatches(slots);

    for (let i = 0; i < rounds.length; i++)
        createRound(stageId, groupId, i + 1, rounds[0].length, rounds[i], getMatchesChildCount(settings));
}

function createStandardBracket(name: string, stageId: number, duels: Duels, settings: StageSettings | undefined): {
    losers: ParticipantSlot[][],
    winner: ParticipantSlot,
} {
    const roundCount = Math.log2(duels.length * 2);
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    let number = 1;
    const losers: ParticipantSlot[][] = [];

    for (let i = roundCount - 1; i >= 0; i--) {
        const matchCount = Math.pow(2, i);
        duels = getCurrentDuels(duels, matchCount, 'natural');
        createRound(stageId, groupId, number++, matchCount, duels, getMatchesChildCount(settings));
        losers.push(duels.map(byePropagation));
    }

    const winner = byeResult(duels[0]);
    return { losers, winner };
}

function createMajorMinorBracket(name: string, stageId: number, losers: ParticipantSlot[][], settings: StageSettings | undefined): ParticipantSlot {
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    const majorRoundCount = losers.length - 1;
    const participantCount = losers[0].length * 4;

    let losersId = 0;
    let duels = helpers.makePairs(losers[losersId++]);
    let number = 1;

    for (let i = 0; i < majorRoundCount; i++) {
        const matchCount = Math.pow(2, majorRoundCount - i - 1);

        // Major round.
        let majorOrdering = i === 0 ? getMajorOrdering(settings, participantCount) : null;
        duels = getCurrentDuels(duels, matchCount, majorOrdering, true);
        createRound(stageId, groupId, number++, matchCount, duels, getMatchesChildCount(settings));

        // Minor round.
        let minorOrdering = getMinorOrdering(settings, i, participantCount);
        duels = getCurrentDuels(duels, matchCount, minorOrdering, false, losers[losersId++]);
        createRound(stageId, groupId, number++, matchCount, duels, getMatchesChildCount(settings));
    }

    return byeResult(duels[0]); // Winner.
}

/**
 * Creates a bracket with rounds that only have 1 match each.
 */
function createUniqueMatchBracket(name: string, stageId: number, duels: Duels, settings: StageSettings | undefined) {
    const groupId = db.insert('group', {
        stage_id: stageId,
        name,
    });

    for (let i = 0; i < duels.length; i++)
        createRound(stageId, groupId, i + 1, 1, [duels[i]], getMatchesChildCount(settings));
}

function createRound(stageId: number, groupId: number, roundNumber: number, matchCount: number, duels: Duels, matchesChildCount: number) {
    const roundId = db.insert('round', {
        number: roundNumber,
        stage_id: stageId,
        group_id: groupId,
    });

    for (let i = 0; i < matchCount; i++)
        createMatch(stageId, groupId, roundId, i + 1, duels[i], matchesChildCount);
}

function createMatch(stageId: number, groupId: number, roundId: number, matchNumber: number, opponents: Duel, childCount: number) {
    const opponent1 = toResult(opponents[0]);
    const opponent2 = toResult(opponents[1]);

    const parentId = db.insert<Partial<Match>>('match', {
        number: matchNumber,
        stage_id: stageId,
        group_id: groupId,
        round_id: roundId,
        status: 'pending',
        opponent1,
        opponent2,
        childCount,
    });

    for (let i = 0; i < childCount; i++) {
        db.insert<Partial<MatchGame>>('match_game', {
            number: i + 1,
            parent_id: parentId,
            status: 'pending',
            opponent1,
            opponent2,
        });
    }
}

function getCurrentDuels(prevDuels: Duels, currentMatchCount: number, ordering: SeedOrdering): Duels;
function getCurrentDuels(prevDuels: Duels, currentMatchCount: number, ordering: SeedOrdering | null, major: true): Duels;
function getCurrentDuels(prevDuels: Duels, currentMatchCount: number, ordering: SeedOrdering, major: false, losers: ParticipantSlot[]): Duels;

function getCurrentDuels(prevDuels: Duels, currentMatchCount: number, ordering: SeedOrdering | null, major?: boolean, losers?: ParticipantSlot[]): Duels {
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

function byeResult(opponents: Duel): ParticipantSlot {
    if (opponents[0] === null && opponents[1] === null) // Double BYE.
        return null; // BYE.

    if (opponents[0] === null && opponents[1] !== null) // opponent1 BYE.
        return { id: opponents[1]!.id }; // opponent2.

    if (opponents[0] !== null && opponents[1] === null) // opponent2 BYE.
        return { id: opponents[0]!.id }; // opponent1.

    return { id: null }; // Normal.
}

function byePropagation(opponents: Duel): ParticipantSlot {
    if (opponents[0] === null || opponents[1] === null) // At least one BYE.
        return null; // BYE.

    return { id: null }; // Normal.
}

function registerParticipants(participants: InputParticipants): ParticipantSlot[] {
    db.insert('participant', participants.filter(name => name !== null).map(name => ({ name }))); // Without BYEs.

    const added = db.select<Participant>('participant', _ => true); // TODO: handle participants from different tournaments... (do not take all)
    if (!added) throw Error('No participant added.');

    const slots = participants.map<ParticipantSlot>(name => {
        if (name === null) return null; // BYE.

        const found = added.find(participant => participant.name === name);
        if (!found) throw Error('Participant name not found in database.');

        return { id: found.id };
    });

    return slots;
}

function toResult(opponent: ParticipantSlot): ParticipantResult | null {
    return opponent ? {
        id: opponent.id,
    } : null;
}

function getMatchesChildCount(settings?: StageSettings): number {
    if (settings === undefined || settings.matchesChildCount === undefined) return 0;
    return settings.matchesChildCount;
}

function getOrdering(settings: StageSettings | undefined, index: number, checkType: 'elimination' | 'groups'): SeedOrdering | null {
    if (settings === undefined || settings.seedOrdering === undefined) return null;

    const method = settings.seedOrdering[index];
    if (!method) return null;

    if (checkType === 'elimination' && method.match(/^groups\./))
        throw Error('You must specify a seed ordering method without a \'groups\' prefix');

    if (checkType === 'groups' && !method.match(/^groups\./))
        throw Error('You must specify a seed ordering method with a \'groups\' prefix');

    return method;
}

function getMajorOrdering(settings: StageSettings | undefined, participantCount: number): SeedOrdering | null {
    const ordering = getOrdering(settings, 1, 'elimination');
    return ordering || helpers.defaultMinorOrdering[participantCount][0];
}

function getMinorOrdering(settings: StageSettings | undefined, index: number, participantCount: number): SeedOrdering {
    const ordering = getOrdering(settings, 2 + index, 'elimination');
    return ordering || helpers.defaultMinorOrdering[participantCount][1 + index];
}
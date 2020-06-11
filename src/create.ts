import { Participant, Duels, Duel, InputStage, ParticipantSlot, Match, SeedOrdering, MatchGame } from 'brackets-model';
import { BracketsManager } from '.';
import { IStorage } from './storage';
import * as helpers from './helpers';

export async function createStage(this: BracketsManager, stage: InputStage) {
    const create = new Create(this.storage, stage);

    switch (stage.type) {
        case 'round_robin':
            await create.roundRobin();
            break;
        case 'single_elimination':
            await create.singleElimination();
            break;
        case 'double_elimination':
            await create.doubleElimination();
            break;
        default:
            throw Error('Unknown stage type.');
    }
}

class Create {
    
    private storage: IStorage;
    private stage: InputStage;

    constructor(storage: IStorage, stage: InputStage) {
        this.storage = storage;
        this.stage = stage;
    }

    public async roundRobin() {
        if (!this.stage.settings || !this.stage.settings.groupCount) throw Error('You must specify a group count for round-robin stages.');

        if (Array.isArray(this.stage.settings.seedOrdering)
            && this.stage.settings.seedOrdering.length !== 1) throw Error('You must specify one seed ordering method.');

        // Default method for groups: Effort balanced.
        const method = this.getOrdering(0, 'groups') || 'groups.effort_balanced';
        const stageId = await this.storage.insert('stage', {
            name: this.stage.name,
            type: this.stage.type,
        });

        const slots = await this.registerParticipants();
        const ordered: ParticipantSlot[] = helpers.ordering[method](slots, this.stage.settings.groupCount);

        const groups = helpers.makeGroups(ordered, this.stage.settings.groupCount);

        for (let i = 0; i < groups.length; i++)
            await this.createGroup(`Group ${i + 1}`, stageId, groups[i]);
    }

    public async singleElimination() {
        if (this.stage.settings && Array.isArray(this.stage.settings.seedOrdering) &&
            this.stage.settings.seedOrdering.length !== 1) throw Error('You must specify one seed ordering method.');

        // Default method for single elimination: Inner outer.
        const method = this.getOrdering(0, 'elimination') || 'inner_outer';
        const stageId = await this.storage.insert('stage', {
            name: this.stage.name,
            type: this.stage.type,
        });

        const slots = await this.registerParticipants();
        const ordered: ParticipantSlot[] = helpers.ordering[method](slots);
        const duels = helpers.makePairs(ordered);

        const { losers } = await this.createStandardBracket('Bracket', stageId, duels);

        const semiFinalLosers = losers[losers.length - 2];
        if (this.stage.settings && this.stage.settings.consolationFinal)
            this.createUniqueMatchBracket('Consolation Final', stageId, [semiFinalLosers]);
    }

    public async doubleElimination() {
        if (this.stage.settings && Array.isArray(this.stage.settings.seedOrdering) &&
            this.stage.settings.seedOrdering.length < 1) throw Error('You must specify at least one seed ordering method.');

        // Default method for WB: Inner outer.
        const method = this.getOrdering(0, 'elimination') || 'inner_outer';
        const stageId = await this.storage.insert('stage', {
            name: this.stage.name,
            type: this.stage.type,
        });

        const slots = await this.registerParticipants();
        const ordered: ParticipantSlot[] = helpers.ordering[method](slots);
        const duels = helpers.makePairs(ordered);

        const { losers: losersWb, winner: winnerWb } = await this.createStandardBracket('Winner Bracket', stageId, duels);
        const winnerLb = await this.createMajorMinorBracket('Loser Bracket', stageId, losersWb);

        // Simple Grand Final by default.
        const grandFinal = (this.stage.settings && this.stage.settings.grandFinal) || 'simple';

        if (grandFinal === 'simple') {
            await this.createUniqueMatchBracket('Grand Final', stageId, [
                [winnerWb, winnerLb]
            ]);
        } else if (grandFinal === 'double') {
            await this.createUniqueMatchBracket('Grand Final', stageId, [
                [winnerWb, winnerLb],
                [{ id: null }, { id: null }] // Won't be shown if the WB winner wins the first time.
            ]);
        }
    }

    private async createGroup(name: string, stageId: number, slots: ParticipantSlot[]) {
        const groupId = await this.storage.insert('group', {
            stage_id: stageId,
            name,
        });

        const rounds = helpers.roundRobinMatches(slots);

        for (let i = 0; i < rounds.length; i++)
            this.createRound(stageId, groupId, i + 1, rounds[0].length, rounds[i], this.getMatchesChildCount());
    }

    private async createStandardBracket(name: string, stageId: number, duels: Duels): Promise<{
        losers: ParticipantSlot[][],
        winner: ParticipantSlot,
    }> {
        const roundCount = Math.log2(duels.length * 2);
        const groupId = await this.storage.insert('group', {
            stage_id: stageId,
            name,
        });

        let number = 1;
        const losers: ParticipantSlot[][] = [];

        for (let i = roundCount - 1; i >= 0; i--) {
            const matchCount = Math.pow(2, i);
            duels = this.getCurrentDuels(duels, matchCount, 'natural');
            this.createRound(stageId, groupId, number++, matchCount, duels, this.getMatchesChildCount());
            losers.push(duels.map(helpers.byePropagation));
        }

        const winner = helpers.byeResult(duels[0]);
        return { losers, winner };
    }

    private async createMajorMinorBracket(name: string, stageId: number, losers: ParticipantSlot[][]): Promise<ParticipantSlot> {
        const groupId = await this.storage.insert('group', {
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
            let majorOrdering = i === 0 ? this.getMajorOrdering(participantCount) : null;
            duels = this.getCurrentDuels(duels, matchCount, majorOrdering, true);
            this.createRound(stageId, groupId, number++, matchCount, duels, this.getMatchesChildCount());

            // Minor round.
            let minorOrdering = this.getMinorOrdering(i, participantCount);
            duels = this.getCurrentDuels(duels, matchCount, minorOrdering, false, losers[losersId++]);
            this.createRound(stageId, groupId, number++, matchCount, duels, this.getMatchesChildCount());
        }

        return helpers.byeResult(duels[0]); // Winner.
    }

    /**
     * Creates a bracket with rounds that only have 1 match each.
     */
    private async createUniqueMatchBracket(name: string, stageId: number, duels: Duels) {
        const groupId = await this.storage.insert('group', {
            stage_id: stageId,
            name,
        });

        for (let i = 0; i < duels.length; i++)
            this.createRound(stageId, groupId, i + 1, 1, [duels[i]], this.getMatchesChildCount());
    }

    private async createRound(stageId: number, groupId: number, roundNumber: number, matchCount: number, duels: Duels, matchesChildCount: number) {
        const roundId = await this.storage.insert('round', {
            number: roundNumber,
            stage_id: stageId,
            group_id: groupId,
        });

        for (let i = 0; i < matchCount; i++)
            this.createMatch(stageId, groupId, roundId, i + 1, duels[i], matchesChildCount);
    }

    private async createMatch(stageId: number, groupId: number, roundId: number, matchNumber: number, opponents: Duel, childCount: number) {
        const opponent1 = helpers.toResult(opponents[0]);
        const opponent2 = helpers.toResult(opponents[1]);

        const parentId = await this.storage.insert<Partial<Match>>('match', {
            number: matchNumber,
            stage_id: stageId,
            group_id: groupId,
            round_id: roundId,
            childCount,
            status: 'pending',
            opponent1,
            opponent2,
        });

        for (let i = 0; i < childCount; i++) {
            await this.storage.insert<Partial<MatchGame>>('match_game', {
                number: i + 1,
                parent_id: parentId,
                status: 'pending',
                opponent1,
                opponent2,
            });
        }
    }

    private getCurrentDuels(prevDuels: Duels, currentMatchCount: number, ordering: SeedOrdering): Duels;
    private getCurrentDuels(prevDuels: Duels, currentMatchCount: number, ordering: SeedOrdering | null, major: true): Duels;
    private getCurrentDuels(prevDuels: Duels, currentMatchCount: number, ordering: SeedOrdering, major: false, losers: ParticipantSlot[]): Duels;

    private getCurrentDuels(prevDuels: Duels, currentMatchCount: number, ordering: SeedOrdering | null, major?: boolean, losers?: ParticipantSlot[]): Duels {
        if ((major === undefined || major === true) && prevDuels.length === currentMatchCount) return prevDuels; // First round.

        const currentDuels: Duels = [];

        if (major === undefined || major === true) { // From major to major (WB) or minor to major (LB).
            for (let matchId = 0; matchId < currentMatchCount; matchId++) {
                const prevMatchId = matchId * 2;
                currentDuels.push([
                    helpers.byeResult(prevDuels[prevMatchId + 0]), // opponent1.
                    helpers.byeResult(prevDuels[prevMatchId + 1]), // opponent2.
                ]);
            }
        } else { // From major to minor (LB).
            for (let matchId = 0; matchId < currentMatchCount; matchId++) {
                const prevMatchId = matchId;
                currentDuels.push([
                    helpers.byeResult(prevDuels[prevMatchId]), // opponent1.
                    losers![prevMatchId], // opponent2.
                ]);
            }
        }

        return currentDuels;
    }

    private async registerParticipants(): Promise<ParticipantSlot[]> {
        const participants = this.stage.participants.filter(name => name !== null).map(name => ({ name })); // Without BYEs.

        if (!await this.storage.insert('participant', participants)) {
            throw Error('Error registering the participants.');
        }

        const added = await this.storage.select<Participant>('participant'); // TODO: handle participants from different tournaments... (do not take all)
        if (!added) throw Error('Could not find any registered participant.');

        const slots = this.stage.participants.map<ParticipantSlot>(name => {
            if (name === null) return null; // BYE.

            const found = added.find(participant => participant.name === name);
            if (!found) throw Error('Participant name not found in database.');

            return { id: found.id };
        });

        return slots;
    }

    private getMatchesChildCount(): number {
        if (this.stage.settings === undefined || this.stage.settings.matchesChildCount === undefined) return 0;
        return this.stage.settings.matchesChildCount;
    }

    private getOrdering(index: number, checkType: 'elimination' | 'groups'): SeedOrdering | null {
        if (this.stage.settings === undefined || this.stage.settings.seedOrdering === undefined) return null;

        const method = this.stage.settings.seedOrdering[index];
        if (!method) return null;

        if (checkType === 'elimination' && method.match(/^groups\./))
            throw Error('You must specify a seed ordering method without a \'groups\' prefix');

        if (checkType === 'groups' && !method.match(/^groups\./))
            throw Error('You must specify a seed ordering method with a \'groups\' prefix');

        return method;
    }

    private getMajorOrdering(participantCount: number): SeedOrdering | null {
        const ordering = this.getOrdering(1, 'elimination');
        return ordering || helpers.defaultMinorOrdering[participantCount][0];
    }

    private getMinorOrdering(index: number, participantCount: number): SeedOrdering {
        const ordering = this.getOrdering(2 + index, 'elimination');
        return ordering || helpers.defaultMinorOrdering[participantCount][1 + index];
    }
}
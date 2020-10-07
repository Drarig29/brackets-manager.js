import { Participant, InputStage, Match, SeedOrdering, MatchGame, Stage, Group, Round, SeedingIds, Seeding } from 'brackets-model';
import { ordering, defaultMinorOrdering } from './ordering';
import { BracketsManager } from '.';
import { IStorage } from './storage';
import * as helpers from './helpers';

/**
 * Creates a stage.
 *
 * @param this Instance of BracketsManager.
 * @param stage The stage to create.
 */
export async function create(this: BracketsManager, stage: InputStage): Promise<void> {
    const instance = new Create(this.storage, stage);
    return instance.run();
}

export class Create {

    private storage: IStorage;
    private stage: InputStage;
    private seedOrdering: SeedOrdering[];
    private updateSeeding: boolean;

    /**
     * Creates an instance of Create, which will handle the creation of the stage.
     *
     * @param storage The implementation of IStorage.
     * @param stage The stage to create.
     * @param updateSeeding Whether the seeding of the stage is being updated.
     */
    constructor(storage: IStorage, stage: InputStage, updateSeeding?: boolean) {
        this.storage = storage;
        this.stage = stage;
        this.stage.settings = this.stage.settings || {};
        this.seedOrdering = this.stage.settings.seedOrdering || [];
        this.updateSeeding = updateSeeding || false;

        if (!this.stage.name)
            throw Error('You must provide a name for the stage.');

        if (!Number.isInteger(this.stage.tournamentId))
            throw Error('You must provide a tournament id for the stage.');

        if (stage.type === 'single_elimination')
            this.stage.settings.consolationFinal = this.stage.settings.consolationFinal || false;

        if (stage.type === 'double_elimination')
            this.stage.settings.grandFinal = this.stage.settings.grandFinal || 'none';

        this.stage.settings.matchesChildCount = this.stage.settings.matchesChildCount || 0;
    }

    /**
     * Run the creation process.
     */
    public async run(): Promise<void> {
        let stageId = -1;

        switch (this.stage.type) {
            case 'round_robin':
                stageId = await this.roundRobin();
                break;
            case 'single_elimination':
                stageId = await this.singleElimination();
                break;
            case 'double_elimination':
                stageId = await this.doubleElimination();
                break;
            default:
                throw Error('Unknown stage type.');
        }

        if (stageId === -1)
            throw Error('Something went wrong when creating the stage.');

        await this.ensureSeedOrdering(stageId);
    }

    /**
     * Creates a round-robin stage.
     * 
     * Group count must be given. It will distribute participants in groups and rounds.
     */
    private async roundRobin() {
        const groups = await this.getRoundRobinGroups();
        const stageId = await this.createStage();

        for (let i = 0; i < groups.length; i++)
            await this.createRoundRobinGroup(stageId, i + 1, groups[i]);

        return stageId;
    }

    /**
     * Creates a single elimination stage.
     * 
     * One bracket and optionally a consolation final between semi-final losers.
     */
    private async singleElimination() {
        if (Array.isArray(this.stage.settings?.seedOrdering) &&
            this.stage.settings?.seedOrdering.length !== 1) throw Error('You must specify one seed ordering method.');

        const slots = await this.getSlots();
        const stageId = await this.createStage();
        const { losers } = await this.createStandardBracket(stageId, 1, slots);
        await this.createConsolationFinal(stageId, losers);

        return stageId;
    }

    /**
     * Creates a double elimination stage.
     * 
     * One upper bracket (winner bracket, WB), one lower bracket (loser bracket, LB) and optionally a grand final
     * between the winner of both bracket, which can be simple or double.
     */
    private async doubleElimination() {
        if (this.stage.settings && Array.isArray(this.stage.settings.seedOrdering) &&
            this.stage.settings.seedOrdering.length < 1) throw Error('You must specify at least one seed ordering method.');

        const slots = await this.getSlots();
        const stageId = await this.createStage();
        const { losers: losersWb, winner: winnerWb } = await this.createStandardBracket(stageId, 1, slots);

        // If the size is only two (less is impossible), then a lower bracket and a grand final are not necessary.
        // Here, the size has already been checked by getSlots().
        if (this.stage.settings?.size! > 2) {
            const winnerLb = await this.createLowerBracket(stageId, 2, losersWb);
            await this.createGrandFinal(stageId, winnerWb, winnerLb);
        }

        return stageId;
    }

    /**
     * Creates a round-robin group.
     * 
     * This will make as many rounds as needed to let each participant match every other once.
     *
     * @param stageId ID of the parent stage.
     * @param number Number in the stage.
     * @param slots A list of slots.
     */
    private async createRoundRobinGroup(stageId: number, number: number, slots: ParticipantSlot[]) {
        const groupId = await this.insertGroup({
            stage_id: stageId,
            number,
        });

        if (groupId === -1)
            throw Error('Could not insert the group.');

        const rounds = helpers.roundRobinMatches(slots);

        for (let i = 0; i < rounds.length; i++)
            await this.createRound(stageId, groupId, i + 1, rounds[0].length, rounds[i]);
    }

    /**
     * Creates a standard bracket, which is the only one in single elimination and the upper one in double elimination.
     * 
     * This will make as many rounds as needed to end with one winner.
     *
     * @param stageId ID of the parent stage.
     * @param number Number in the stage.
     * @param slots A list of slots.
     */
    private async createStandardBracket(stageId: number, number: number, slots: ParticipantSlot[]): Promise<{
        losers: ParticipantSlot[][],
        winner: ParticipantSlot,
    }> {
        const method = this.getStandardBracketFirstRoundOrdering();
        const ordered = ordering[method](slots);

        const roundCount = helpers.upperBracketRoundCount(slots.length);
        const groupId = await this.insertGroup({
            stage_id: stageId,
            number,
        });

        if (groupId === -1)
            throw Error('Could not insert the group.');

        let duels = helpers.makePairs(ordered);
        let roundNumber = 1;

        const losers: ParticipantSlot[][] = [];

        for (let i = roundCount - 1; i >= 0; i--) {
            const matchCount = Math.pow(2, i);
            duels = this.getCurrentDuels(duels, matchCount);
            losers.push(duels.map(helpers.byeLoser));
            await this.createRound(stageId, groupId, roundNumber++, matchCount, duels);
        }

        return { losers, winner: helpers.byeWinner(duels[0]) };
    }

    /**
     * Creates a lower bracket, alternating between major and minor rounds.
     * 
     * - A major round is a regular round.
     * - A minor round matches the previous (major) round's winners against upper bracket losers of the corresponding round.
     *
     * @param stageId ID of the parent stage.
     * @param number Number in the stage.
     * @param losers One list of losers per upper bracket round.
     */
    private async createLowerBracket(stageId: number, number: number, losers: ParticipantSlot[][]): Promise<ParticipantSlot> {
        // The first pair of rounds (major & minor) takes the **first two** lists of losers (hence the -1).
        const roundPairCount = losers.length - 1;

        // The first list of losers contains the input for the bracket.
        const participantCount = losers[0].length * 4;

        let losersId = 0;

        const method = this.getMajorOrdering(participantCount);
        const ordered = ordering[method](losers[losersId++]);

        const groupId = await this.insertGroup({
            stage_id: stageId,
            number,
        });

        if (groupId === -1)
            throw Error('Could not insert the group.');

        let duels = helpers.makePairs(ordered);
        let roundNumber = 1;

        for (let i = 0; i < roundPairCount; i++) {
            const matchCount = Math.pow(2, roundPairCount - i - 1);

            // Major round.
            duels = this.getCurrentDuels(duels, matchCount, true);
            await this.createRound(stageId, groupId, roundNumber++, matchCount, duels);

            // Minor round.
            const minorOrdering = this.getMinorOrdering(participantCount, i);
            duels = this.getCurrentDuels(duels, matchCount, false, losers[losersId++], minorOrdering);
            await this.createRound(stageId, groupId, roundNumber++, matchCount, duels);
        }

        return helpers.byeWinnerToGrandFinal(duels[0]);
    }

    /**
     * Creates a bracket with rounds that only have 1 match each. Used for finals.
     *
     * @param stageId ID of the parent stage.
     * @param number Number in the stage.
     * @param duels A list of duels.
     */
    private async createUniqueMatchBracket(stageId: number, number: number, duels: Duels) {
        const groupId = await this.insertGroup({
            stage_id: stageId,
            number,
        });

        if (groupId === -1)
            throw Error('Could not insert the group.');

        for (let i = 0; i < duels.length; i++)
            await this.createRound(stageId, groupId, i + 1, 1, [duels[i]]);
    }

    /**
     * Creates a round, which contain matches.
     *
     * @param stageId ID of the parent stage.
     * @param groupId ID of the parent group.
     * @param roundNumber Number in the group.
     * @param matchCount Duel/match count.
     * @param duels A list of duels.
     */
    private async createRound(stageId: number, groupId: number, roundNumber: number, matchCount: number, duels: Duels) {
        const matchesChildCount = this.getMatchesChildCount();

        const roundId = await this.insertRound({
            number: roundNumber,
            stage_id: stageId,
            group_id: groupId,
        });

        if (roundId === -1)
            throw Error('Could not insert the round.');

        for (let i = 0; i < matchCount; i++)
            await this.createMatch(stageId, groupId, roundId, i + 1, duels[i], matchesChildCount);
    }

    /**
     * Creates a match, possibly with match games.
     * 
     * - If `childCount` is 0, then there is no children. The score of the match is directly its intrinsic score.
     * - If `childCount` is greater than 0, then the score of the match will automatically be calculated based on its child games.
     *
     * @param stageId ID of the parent stage.
     * @param groupId ID of the parent group.
     * @param roundId ID of the parent round.
     * @param matchNumber Number in the round.
     * @param opponents The two opponents matching against each other.
     * @param childCount Child count for this match (number of games).
     */
    private async createMatch(stageId: number, groupId: number, roundId: number, matchNumber: number, opponents: Duel, childCount: number) {
        const status = helpers.getMatchByeStatus(opponents);

        const parentId = await this.insertMatch({
            number: matchNumber,
            stage_id: stageId,
            group_id: groupId,
            round_id: roundId,
            child_count: childCount,
            status: status,
            opponent1: helpers.toResult(opponents[0]),
            opponent2: helpers.toResult(opponents[1]),
        });

        if (parentId === -1)
            throw Error('Could not insert the match.');

        for (let i = 0; i < childCount; i++) {
            const id = await this.insertMatchGame({
                number: i + 1,
                parent_id: parentId,
                status: status,
                opponent1: helpers.toResult(opponents[0]),
                opponent2: helpers.toResult(opponents[1]),
            });

            if (id === -1)
                throw Error('Could not insert the match game.');
        }
    }

    /**
     * Gets the duels for the current round based on the previous one. No ordering is done, it must be done beforehand for the first round.
     *
     * @param previousDuels Duels of the previous round.
     * @param currentDuelCount Count of duels (matches) in the current round.
     */
    private getCurrentDuels(previousDuels: Duels, currentDuelCount: number): Duels;

    /**
     * Gets the duels for a major round in the LB. No ordering is done, it must be done beforehand for the first round.
     *
     * @param previousDuels Duels of the previous round.
     * @param currentDuelCount Count of duels (matches) in the current round.
     * @param major Indicates that the round is a major round in the LB.
     */
    private getCurrentDuels(previousDuels: Duels, currentDuelCount: number, major: true): Duels;

    /**
     * Gets the duels for a minor round in the LB. Ordering is done.
     *
     * @param previousDuels Duels of the previous round.
     * @param currentDuelCount Count of duels (matches) in the current round.
     * @param major Indicates that the round is a minor round in the LB.
     * @param losers The losers going from the WB.
     * @param method The ordering method to apply to the losers.
     */
    private getCurrentDuels(previousDuels: Duels, currentDuelCount: number, major: false, losers: ParticipantSlot[], method: SeedOrdering): Duels;

    /**
     * Generic implementation.
     * 
     * @param previousDuels Always given.
     * @param currentDuelCount Always given.
     * @param major Only for loser bracket.
     * @param losers Only for minor round of loser bracket.
     * @param method Ordering method for the losers.
     */
    private getCurrentDuels(previousDuels: Duels, currentDuelCount: number, major?: boolean, losers?: ParticipantSlot[], method?: SeedOrdering): Duels {
        if ((major === undefined || major === true) && previousDuels.length === currentDuelCount) {
            // First round.
            return previousDuels;
        }

        if (major === undefined || major === true) {
            // From major to major (WB) or minor to major (LB).
            return helpers.transitionToMajor(previousDuels);
        }

        // From major to minor (LB).
        return helpers.transitionToMinor(previousDuels, losers!, method!);
    }

    /**
     * Returns a list of slots.
     * - If `seeding` was given, inserts them in the storage.
     * - If `size` was given, only returns a list of empty slots.
     */
    public async getSlots(): Promise<ParticipantSlot[]> {
        const size = this.stage.settings?.size || this.stage.seeding?.length || 0;
        helpers.ensureValidSize(size);

        if (size && !this.stage.seeding)
            return Array.from(Array(size), (_: ParticipantSlot, i) => ({ id: null, position: i + 1 }));

        if (!this.stage.seeding) throw Error('Either size or seeding must be given.');

        this.stage.settings = {
            ...this.stage.settings,
            size, // Always set the size.
        }

        if (helpers.isSeedingWithIds(this.stage.seeding))
            return this.getSlotsUsingIds(this.stage.seeding as SeedingIds);

        return this.getSlotsUsingNames(this.stage.seeding as Seeding);
    }

    /**
     * Returns the list of slots with a seeding containing names. Participants may be added to database.
     *
     * @param seeding The seeding (names).
     */
    private async getSlotsUsingNames(seeding: Seeding) {
        const participants = helpers.extractParticipantsFromSeeding(this.stage.tournamentId, this.stage.seeding as Seeding);

        if (!await this.registerParticipants(participants))
            throw Error('Error registering the participants.');

        // Get participants back with ids.
        const added = await this.storage.select<Participant>('participant', { tournament_id: this.stage.tournamentId });
        if (!added) throw Error('Error getting registered participant.');

        return helpers.mapParticipantsNamesToDatabase(seeding, added);
    }

    /**
     * Returns the list of slots with a seeding containing ids. No database mutation.
     *
     * @param seeding The seeding (ids).
     */
    private async getSlotsUsingIds(seeding: SeedingIds) {
        const participants = await this.storage.select<Participant>('participant', { tournament_id: this.stage.tournamentId });
        if (!participants) throw Error('No available participants.');

        return helpers.mapParticipantsIdsToDatabase(seeding, participants);
    }

    /**
     * Gets the current stage number based on existing stages.
     */
    private async getStageNumber(): Promise<number> {
        const stages = await this.storage.select<Stage>('stage', { tournament_id: this.stage.tournamentId });
        const stageCount = stages ? stages.length : 0;
        return this.updateSeeding ? stageCount : stageCount + 1;
    }

    /**
     * Safely gets `matchesChildCount` in the stage input settings.
     */
    private getMatchesChildCount(): number {
        if (!this.stage.settings?.matchesChildCount)
            return 0;

        return this.stage.settings.matchesChildCount;
    }

    /**
     * Safely gets an ordering by its index in the stage input settings.
     *
     * @param orderingIndex Index of the ordering.
     * @param stageType A value indicating if the method should be a group method or not.
     * @param defaultMethod The default method to use if not given.
     */
    private getOrdering(orderingIndex: number, stageType: 'elimination' | 'groups', defaultMethod: SeedOrdering): SeedOrdering {
        if (!this.stage.settings?.seedOrdering) {
            this.seedOrdering.push(defaultMethod);
            return defaultMethod;
        }

        const method = this.stage.settings.seedOrdering[orderingIndex];
        if (!method) {
            this.seedOrdering.push(defaultMethod);
            return defaultMethod;
        }

        if (stageType === 'elimination' && method.match(/^groups\./))
            throw Error('You must specify a seed ordering method without a \'groups\' prefix');

        if (stageType === 'groups' && method !== 'natural' && !method.match(/^groups\./))
            throw Error('You must specify a seed ordering method with a \'groups\' prefix');

        return method;
    }

    /**
     * Gets the duels in groups for a round-robin stage.
     */
    private async getRoundRobinGroups(): Promise<Duels> {
        if (this.stage.settings?.groupCount === undefined)
            throw Error('You must specify a group count for round-robin stages.');

        if (Array.isArray(this.stage.settings.seedOrdering) && this.stage.settings.seedOrdering.length !== 1)
            throw Error('You must specify one seed ordering method.');

        const method = this.getRoundRobinOrdering();
        const slots = await this.getSlots();
        const ordered = ordering[method](slots, this.stage.settings.groupCount);
        return helpers.makeGroups(ordered, this.stage.settings.groupCount);
    }

    /**
     * Returns the ordering method for the groups in a round-robin stage.
     */
    public getRoundRobinOrdering(): SeedOrdering {
        return this.getOrdering(0, 'groups', 'groups.effort_balanced');
    }

    /**
     * Returns the ordering method for the first round of the upper bracket of an elimination stage.
     */
    public getStandardBracketFirstRoundOrdering(): SeedOrdering {
        return this.getOrdering(0, 'elimination', 'inner_outer');
    }

    /**
     * Safely gets the only major ordering for the lower bracket.
     *
     * @param participantCount Number of participants in the stage.
     */
    private getMajorOrdering(participantCount: number): SeedOrdering {
        return this.getOrdering(1, 'elimination', defaultMinorOrdering[participantCount][0]);
    }

    /**
     * Safely gets a minor ordering for the lower bracket by its index.
     *
     * @param participantCount Number of participants in the stage.
     * @param index Index of the minor round.
     */
    private getMinorOrdering(participantCount: number, index: number): SeedOrdering {
        return this.getOrdering(2 + index, 'elimination', defaultMinorOrdering[participantCount][1 + index]);
    }

    /**
     * Insert a stage or finds an existing one.
     *
     * @param stage The stage to insert.
     */
    private async insertStage(stage: OmitId<Stage>): Promise<number> {
        let existing: Stage | null = null;

        if (this.updateSeeding) {
            existing = await this.storage.selectFirst<Stage>('stage', {
                tournament_id: stage.tournament_id,
                number: stage.number,
            });
        }

        if (!existing)
            return this.storage.insert<Stage>('stage', stage);

        return existing.id;
    }

    /**
     * Insert a group or finds an existing one.
     *
     * @param group The group to insert.
     */
    private async insertGroup(group: OmitId<Group>): Promise<number> {
        let existing: Group | null = null;

        if (this.updateSeeding) {
            existing = await this.storage.selectFirst<Group>('group', {
                stage_id: group.stage_id,
                number: group.number,
            });
        }

        if (!existing)
            return this.storage.insert<Group>('group', group);

        return existing.id;
    }

    /**
     * Insert a round or finds an existing one.
     *
     * @param round The round to insert.
     */
    private async insertRound(round: OmitId<Round>): Promise<number> {
        let existing: Round | null = null;

        if (this.updateSeeding) {
            existing = await this.storage.selectFirst<Round>('round', {
                group_id: round.group_id,
                number: round.number,
            });
        }

        if (!existing)
            return this.storage.insert<Round>('round', round);

        return existing.id;
    }

    /**
     * Insert a match or finds an existing one (and updates it).
     *
     * @param match The match to insert.
     */
    private async insertMatch(match: OmitId<Match>): Promise<number> {
        let existing: Match | null = null;

        if (this.updateSeeding) {
            existing = await this.storage.selectFirst<Match>('match', {
                round_id: match.round_id,
                number: match.number,
            });
        }

        if (!existing)
            return this.storage.insert<Match>('match', match);

        await this.storage.update<Match>('match', existing.id, { ...existing, ...helpers.getUpdatedMatchResults(match) });

        return existing.id;
    }

    /**
     * Insert a match game or finds an existing one (and updates it).
     *
     * @param matchGame The match game to insert.
     */
    private async insertMatchGame(matchGame: OmitId<MatchGame>): Promise<number> {
        let existing: MatchGame | null = null;

        if (this.updateSeeding) {
            existing = await this.storage.selectFirst<MatchGame>('match_game', {
                parent_id: matchGame.parent_id,
                number: matchGame.number,
            });
        }

        if (!existing)
            return this.storage.insert<MatchGame>('match_game', matchGame);

        await this.storage.update<MatchGame>('match_game', existing.id, { ...existing, ...helpers.getUpdatedMatchResults(matchGame) });

        return existing.id;
    }

    /**
     * Insert missing participants.
     *
     * @param participants The list of participants to process.
     */
    private async registerParticipants(participants: OmitId<Participant>[]): Promise<boolean> {
        const existing = await this.storage.select<Participant>('participant', { tournament_id: this.stage.tournamentId });

        // Insert all if nothing.
        if (!existing || existing.length === 0)
            return this.storage.insert<Participant>('participant', participants);

        // Insert only missing otherwise.
        for (const participant of participants) {
            if (existing.some(value => value.name === participant.name))
                continue;

            const result = await this.storage.insert<Participant>('participant', participant);
            if (result === -1) return false;
        }

        return true;
    }

    /**
     * Creates a new stage.
     */
    private async createStage() {
        const stageNumber = await this.getStageNumber();

        const stageId = await this.insertStage({
            tournament_id: this.stage.tournamentId,
            name: this.stage.name,
            type: this.stage.type,
            number: stageNumber,
            settings: this.stage.settings || {},
        });

        if (stageId === -1)
            throw Error('Could not insert the stage.');

        return stageId;
    }

    /**
     * Creates a consolation final for the semi final losers of a single elimination stage.
     *
     * @param stageId ID of the stage.
     * @param losers The semi final losers who will play the consolation final.
     */
    private async createConsolationFinal(stageId: number, losers: ParticipantSlot[][]) {
        if (!this.stage.settings?.consolationFinal) return;

        const semiFinalLosers = losers[losers.length - 2];
        await this.createUniqueMatchBracket(stageId, 2, [semiFinalLosers]);
    }

    /**
     * Creates a grand final (none, simple or double) for winners of both bracket in a double elimination stage.
     *
     * @param stageId ID of the stage.
     * @param winnerWb The winner of the winner bracket.
     * @param winnerLb The winner of the loser bracket.
     */
    private async createGrandFinal(stageId: number, winnerWb: ParticipantSlot, winnerLb: ParticipantSlot) {
        // No Grand Final by default.
        const grandFinal = this.stage.settings?.grandFinal;
        if (grandFinal === undefined) return;

        // One duel by default.
        const finalDuels: Duels = [[winnerWb, winnerLb]];

        // Second duel.
        if (grandFinal === 'double')
            finalDuels.push([{ id: null }, { id: null }]);

        await this.createUniqueMatchBracket(stageId, 3, finalDuels);
    }

    /**
     * Ensures that the seed ordering list is stored even if it was not given in the first place.
     *
     * @param stageId ID of the stage.
     */
    private async ensureSeedOrdering(stageId: number) {
        if (this.stage.settings?.seedOrdering?.length === this.seedOrdering.length) return;

        const stage = await this.storage.select<Stage>('stage', stageId);
        if (!stage) throw Error('Stage not found.');

        stage.settings = {
            ...stage.settings,
            seedOrdering: this.seedOrdering,
        };

        await this.storage.update<Stage>('stage', stageId, stage);
    }
}
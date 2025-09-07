import { DeepPartial, Storage } from '../types';
import { Group, Match, MatchGame, Round, SeedOrdering, Stage, StageType, GroupType, Id } from 'brackets-model';
import { RoundPositionalInfo } from '../types';
import { StageCreator } from './stage/creator';
import * as helpers from '../helpers';

export class BaseGetter {

    protected readonly storage: Storage;

    /**
     * Creates an instance of a Storage getter.
     *
     * @param storage The implementation of Storage.
     */
    constructor(storage: Storage) {
        this.storage = storage;
    }

    /**
     * Gets all the rounds that contain ordered participants.
     *
     * @param stage The stage to get rounds from.
     */
    protected async getOrderedRounds(stage: Stage): Promise<Round[]> {
        if (!stage?.settings.size) throw Error('The stage has no size.');

        if (stage.type === 'single_elimination')
            return this.getOrderedRoundsSingleElimination(stage.id);

        return this.getOrderedRoundsDoubleElimination(stage.id);
    }

    /**
     * Gets all the rounds that contain ordered participants in a single elimination stage.
     *
     * @param stageId ID of the stage.
     */
    private async getOrderedRoundsSingleElimination(stageId: Id): Promise<Round[]> {
        return [await this.getUpperBracketFirstRound(stageId)];
    }

    /**
     * Gets all the rounds that contain ordered participants in a double elimination stage.
     *
     * @param stageId ID of the stage.
     */
    private async getOrderedRoundsDoubleElimination(stageId: Id): Promise<Round[]> {
        // Getting all rounds instead of cherry-picking them is the least expensive.
        const rounds = await this.storage.select('round', { stage_id: stageId });
        if (!rounds) throw Error('Error getting rounds.');

        const loserBracket = await this.getLoserBracket(stageId);
        if (!loserBracket) throw Error('Loser bracket not found.');

        const firstRoundWB = rounds[0];

        const roundsLB = rounds.filter(r => r.group_id === loserBracket.id);
        const orderedRoundsLB = roundsLB.filter(r => helpers.isOrderingSupportedLoserBracket(r.number, roundsLB.length));

        return [firstRoundWB, ...orderedRoundsLB];
    }

    /**
     * Gets the positional information (number in group and total number of rounds in group) of a round based on its id.
     *
     * @param roundId ID of the round.
     */
    protected async getRoundPositionalInfo(roundId: Id): Promise<RoundPositionalInfo> {
        const round = await this.storage.select('round', roundId);
        if (!round) throw Error('Round not found.');

        const rounds = await this.storage.select('round', { group_id: round.group_id });
        if (!rounds) throw Error('Error getting rounds.');

        return {
            roundNumber: round.number,
            roundCount: rounds.length,
        };
    }

    /**
     * Gets the matches leading to the given match.
     *
     * @param match The current match.
     * @param matchLocation Location of the current match.
     * @param stage The parent stage.
     * @param roundNumber Number of the round.
     */
    protected async getPreviousMatches(match: Match, matchLocation: GroupType, stage: Stage, roundNumber: number): Promise<Match[]> {
        if (matchLocation === 'loser_bracket')
            return this.getPreviousMatchesLB(match, stage, roundNumber);

        if (matchLocation === 'final_group')
            return this.getPreviousMatchesFinal(match, stage, roundNumber);

        if (roundNumber === 1)
            return []; // The match is in the first round of an upper bracket.

        return this.getMatchesBeforeMajorRound(match, roundNumber);
    }

    /**
     * Gets the matches leading to the given match, which is in a final group (consolation final or grand final).
     *
     * @param match The current match.
     * @param stage The parent stage.
     * @param roundNumber Number of the current round.
     */
    private async getPreviousMatchesFinal(match: Match, stage: Stage, roundNumber: number): Promise<Match[]> {
        if (stage.type === 'single_elimination')
            return this.getPreviousMatchesFinalSingleElimination(match, stage);

        return this.getPreviousMatchesFinalDoubleElimination(match, roundNumber);
    }

    /**
     * Gets the matches leading to the given match, which is in a final group (consolation final).
     *
     * @param match The current match.
     * @param stage The parent stage.
     */
    private async getPreviousMatchesFinalSingleElimination(match: Match, stage: Stage): Promise<Match[]> {
        const upperBracket = await this.getUpperBracket(match.stage_id);
        const upperBracketRoundCount = helpers.getUpperBracketRoundCount(stage.settings.size!);

        const semiFinalsRound = await this.storage.selectFirst('round', {
            group_id: upperBracket.id,
            number: upperBracketRoundCount - 1, // Second to last round
        });

        if (!semiFinalsRound)
            throw Error('Semi finals round not found.');

        const semiFinalMatches = await this.storage.select('match', {
            round_id: semiFinalsRound.id,
        });

        if (!semiFinalMatches)
            throw Error('Error getting semi final matches.');

        // In single elimination, both the final and consolation final have the same previous matches.
        return semiFinalMatches;
    }

    /**
     * Gets the matches leading to the given match, which is in a final group (grand final).
     *
     * @param match The current match.
     * @param roundNumber Number of the current round.
     */
    private async getPreviousMatchesFinalDoubleElimination(match: Match, roundNumber: number): Promise<Match[]> {
        if (roundNumber > 1) // Double grand final
            return [await this.findMatch(match.group_id, roundNumber - 1, 1)];

        const winnerBracket = await this.getUpperBracket(match.stage_id);
        const lastRoundWB = await this.getLastRound(winnerBracket.id);

        const winnerBracketFinalMatch = await this.storage.selectFirst('match', {
            round_id: lastRoundWB.id,
            number: 1,
        });

        if (!winnerBracketFinalMatch)
            throw Error('Match not found.');

        const loserBracket = await this.getLoserBracket(match.stage_id);
        if (!loserBracket)
            throw Error('Loser bracket not found.');

        const lastRoundLB = await this.getLastRound(loserBracket.id);
        const loserBracketFinalMatch = await this.storage.selectFirst('match', {
            round_id: lastRoundLB.id,
            number: 1,
        });

        if (!loserBracketFinalMatch)
            throw Error('Match not found.');

        return [winnerBracketFinalMatch, loserBracketFinalMatch];
    }

    /**
     * Gets the matches leading to a given match from the loser bracket.
     *
     * @param match The current match.
     * @param stage The parent stage.
     * @param roundNumber Number of the round.
     */
    private async getPreviousMatchesLB(match: Match, stage: Stage, roundNumber: number): Promise<Match[]> {
        if (stage.settings.skipFirstRound && roundNumber === 1)
            return [];

        if (helpers.hasBye(match))
            return []; // Shortcut because we are coming from propagateByes().

        const winnerBracket = await this.getUpperBracket(match.stage_id);
        const actualRoundNumberWB = Math.ceil((roundNumber + 1) / 2);

        const roundNumberWB = stage.settings.skipFirstRound ? actualRoundNumberWB - 1 : actualRoundNumberWB;

        if (roundNumber === 1)
            return this.getMatchesBeforeFirstRoundLB(match, winnerBracket.id, roundNumberWB);

        if (helpers.isMajorRound(roundNumber))
            return this.getMatchesBeforeMajorRound(match, roundNumber);

        return this.getMatchesBeforeMinorRoundLB(match, winnerBracket.id, roundNumber, roundNumberWB);
    }

    /**
     * Gets the matches leading to a given match in a major round (every round of upper bracket or specific ones in lower bracket).
     *
     * @param match The current match.
     * @param roundNumber Number of the round.
     */
    private async getMatchesBeforeMajorRound(match: Match, roundNumber: number): Promise<Match[]> {
        return [
            await this.findMatch(match.group_id, roundNumber - 1, match.number * 2 - 1),
            await this.findMatch(match.group_id, roundNumber - 1, match.number * 2),
        ];
    }

    /**
     * Gets the matches leading to a given match in the first round of the loser bracket.
     *
     * @param match The current match.
     * @param winnerBracketId ID of the winner bracket.
     * @param roundNumberWB The number of the previous round in the winner bracket.
     */
    private async getMatchesBeforeFirstRoundLB(match: Match, winnerBracketId: Id, roundNumberWB: number): Promise<Match[]> {
        return [
            await this.findMatch(winnerBracketId, roundNumberWB, helpers.getOriginPosition(match, 'opponent1')),
            await this.findMatch(winnerBracketId, roundNumberWB, helpers.getOriginPosition(match, 'opponent2')),
        ];
    }

    /**
     * Gets the matches leading to a given match in a minor round of the loser bracket.
     *
     * @param match The current match.
     * @param winnerBracketId ID of the winner bracket.
     * @param roundNumber Number of the current round.
     * @param roundNumberWB The number of the previous round in the winner bracket.
     */
    private async getMatchesBeforeMinorRoundLB(match: Match, winnerBracketId: Id, roundNumber: number, roundNumberWB: number): Promise<Match[]> {
        const matchNumber = helpers.getOriginPosition(match, 'opponent1');

        return [
            await this.findMatch(winnerBracketId, roundNumberWB, matchNumber),
            await this.findMatch(match.group_id, roundNumber - 1, match.number),
        ];
    }

    /**
     * Gets the match(es) where the opponents of the current match will go just after.
     *
     * @param match The current match.
     * @param matchLocation Location of the current match.
     * @param stage The parent stage.
     * @param roundNumber The number of the current round.
     * @param roundCount Count of rounds.
     */
    protected async getNextMatches(match: Match, matchLocation: GroupType, stage: Stage, roundNumber: number, roundCount: number): Promise<(Match | null)[]> {
        switch (matchLocation) {
            case 'single_bracket':
                return this.getNextMatchesUpperBracket(match, stage, roundNumber, roundCount);
            case 'winner_bracket':
                return this.getNextMatchesWB(match, stage, roundNumber, roundCount);
            case 'loser_bracket':
                return this.getNextMatchesLB(match, stage, roundNumber, roundCount);
            case 'final_group':
                return this.getNextMatchesFinal(match, stage, roundNumber, roundCount);
            default:
                throw Error('Unknown bracket kind.');
        }
    }

    /**
     * Gets the match(es) where the opponents of the current match of winner bracket will go just after.
     *
     * @param match The current match.
     * @param stage The parent stage.
     * @param roundNumber The number of the current round.
     * @param roundCount Count of rounds.
     */
    private async getNextMatchesWB(match: Match, stage: Stage, roundNumber: number, roundCount: number): Promise<(Match | null)[]> {
        const loserBracket = await this.getLoserBracket(match.stage_id);
        if (loserBracket === null) // Only one match in the stage, there is no loser bracket.
            return [];

        const actualRoundNumber = stage.settings.skipFirstRound ? roundNumber + 1 : roundNumber;
        const roundNumberLB = actualRoundNumber > 1 ? (actualRoundNumber - 1) * 2 : 1;

        const participantCount = stage.settings.size!;
        const method = helpers.getLoserOrdering(stage.settings.seedOrdering!, roundNumberLB);
        const actualMatchNumberLB = helpers.findLoserMatchNumber(participantCount, roundNumberLB, match.number, method);

        return [
            ...await this.getNextMatchesUpperBracket(match, stage, roundNumber, roundCount), // Can be `null`, to denote that the winner goes nowhere, e.g. in `WB Final`.
            await this.findMatch(loserBracket.id, roundNumberLB, actualMatchNumberLB),
        ];
    }

    /**
     * Gets the match(es) where the opponents of the current match of an upper bracket will go just after.
     *
     * @param match The current match.
     * @param stage The parent stage.
     * @param roundNumber The number of the current round.
     * @param roundCount Count of rounds.
     */
    private async getNextMatchesUpperBracket(match: Match, stage: Stage, roundNumber: number, roundCount: number): Promise<(Match | null)[]> {
        if (stage.type === 'single_elimination')
            return this.getNextMatchesUpperBracketSingleElimination(match, stage.type, roundNumber, roundCount);

        return this.getNextMatchesUpperBracketDoubleElimination(match, stage.type, roundNumber, roundCount);
    }

    /**
     * Gets the match(es) where the opponents of the current match of the unique bracket of a single elimination will go just after.
     *
     * @param match The current match.
     * @param stageType Type of the stage.
     * @param roundNumber The number of the current round.
     * @param roundCount Count of rounds.
     */
    private async getNextMatchesUpperBracketSingleElimination(match: Match, stageType: StageType, roundNumber: number, roundCount: number): Promise<Match[]> {
        if (roundNumber === roundCount - 1) {
            const finalGroupId = await this.getFinalGroupId(match.stage_id, stageType);
            const consolationFinal = await this.getFinalGroupFirstMatch(finalGroupId);
            return [
                await this.getDiagonalMatch(match.group_id, roundNumber, match.number),
                ...consolationFinal ? [consolationFinal] : [],
            ];
        }

        if (roundNumber === roundCount)
            return [];

        return [await this.getDiagonalMatch(match.group_id, roundNumber, match.number)];
    }

    /**
     * Gets the match(es) where the opponents of the current match of the unique bracket of a double elimination will go just after.
     *
     * @param match The current match.
     * @param stageType Type of the stage.
     * @param roundNumber The number of the current round.
     * @param roundCount Count of rounds.
     */
    private async getNextMatchesUpperBracketDoubleElimination(match: Match, stageType: StageType, roundNumber: number, roundCount: number): Promise<(Match | null)[]> {
        if (roundNumber === roundCount) {
            const finalGroupId = await this.getFinalGroupId(match.stage_id, stageType);
            return [await this.getFinalGroupFirstMatch(finalGroupId)];
        }

        return [await this.getDiagonalMatch(match.group_id, roundNumber, match.number)];
    }

    /**
     * Gets the match(es) where the opponents of the current match of loser bracket will go just after.
     *
     * @param match The current match.
     * @param stage The parent stage.
     * @param roundNumber The number of the current round.
     * @param roundCount Count of rounds.
     */
    private async getNextMatchesLB(match: Match, stage: Stage, roundNumber: number, roundCount: number): Promise<(Match | null)[]> {
        if (roundNumber === roundCount - 1) {
            const finalGroupId = await this.getFinalGroupId(match.stage_id, stage.type);
            const consolationFinal = await this.getConsolationFinalMatchDoubleElimination(finalGroupId);
            return [
                ...await this.getMatchAfterMajorRoundLB(match, roundNumber), // Winner follows.
                ...consolationFinal ? [consolationFinal] : [], // Loser goes in consolation.
            ];
        }

        if (roundNumber === roundCount) {
            const finalGroupId = await this.getFinalGroupId(match.stage_id, stage.type);
            const grandFinal = await this.getFinalGroupFirstMatch(finalGroupId);
            const consolationFinal = await this.getConsolationFinalMatchDoubleElimination(finalGroupId);

            return [
                grandFinal, // Null if no grand final.
                ...consolationFinal ? [consolationFinal] : [], // Returned array is length 1 if no consolation final.
            ];
        }

        if (helpers.isMajorRound(roundNumber))
            return this.getMatchAfterMajorRoundLB(match, roundNumber);

        return this.getMatchAfterMinorRoundLB(match, roundNumber);
    }

    /**
     * Gets the first match of the final group (consolation final or grand final).
     *
     * @param finalGroupId ID of the final group.
     */
    private async getFinalGroupFirstMatch(finalGroupId: Id | null): Promise<Match | null> {
        if (finalGroupId === null)
            return null; // `null` is required for `getNextMatchesWB()` because of how `applyToNextMatches()` works.

        return this.findMatch(finalGroupId, 1, 1);
    }

    /**
     * Gets the consolation final in a double elimination tournament.
     *
     * @param finalGroupId ID of the final group.
     */
    private async getConsolationFinalMatchDoubleElimination(finalGroupId: Id | null): Promise<Match | null> {
        if (finalGroupId === null)
            return null;

        return this.storage.selectFirst('match', {
            group_id: finalGroupId,
            number: 2, // Used to differentiate grand final and consolation final matches in the same final group.
        });
    }

    /**
     * Gets the match following the current match, which is in the final group (consolation final or grand final).
     *
     * @param match The current match.
     * @param stage The parent stage.
     * @param roundNumber The number of the current round.
     * @param roundCount The count of rounds.
     */
    private async getNextMatchesFinal(match: Match, stage: Stage, roundNumber: number, roundCount: number): Promise<Match[]> {
        if (roundNumber === roundCount)
            return [];

        if (stage.settings.consolationFinal && match.number === 1 && roundNumber === roundCount - 1)
            return []; // Current match is the last grand final match.

        return [await this.findMatch(match.group_id, roundNumber + 1, 1)];
    }

    /**
     * Gets the match where the opponents of the current match of a winner bracket's major round will go just after.
     *
     * @param match The current match.
     * @param roundNumber The number of the current round.
     */
    private async getMatchAfterMajorRoundLB(match: Match, roundNumber: number): Promise<Match[]> {
        return [await this.getParallelMatch(match.group_id, roundNumber, match.number)];
    }

    /**
     * Gets the match where the opponents of the current match of a winner bracket's minor round will go just after.
     *
     * @param match The current match.
     * @param roundNumber The number of the current round.
     */
    private async getMatchAfterMinorRoundLB(match: Match, roundNumber: number): Promise<Match[]> {
        return [await this.getDiagonalMatch(match.group_id, roundNumber, match.number)];
    }

    /**
     * Returns the good seeding ordering based on the stage's type.
     *
     * @param stageType The type of the stage.
     * @param create A reference to a Create instance.
     */
    protected static getSeedingOrdering(stageType: StageType, create: StageCreator): SeedOrdering {
        return stageType === 'round_robin' ? create.getRoundRobinOrdering() : create.getStandardBracketFirstRoundOrdering();
    }

    /**
     * Returns the matches which contain the seeding of a stage based on its type.
     *
     * @param stageId ID of the stage.
     * @param stageType The type of the stage.
     */
    protected async getSeedingMatches(stageId: Id, stageType: StageType): Promise<Match[] | null> {
        if (stageType === 'round_robin')
            return this.storage.select('match', { stage_id: stageId });

        try {
            const firstRound = await this.getUpperBracketFirstRound(stageId);
            return this.storage.select('match', { round_id: firstRound.id });
        } catch {
            return []; // The stage may have not been created yet.
        }
    }

    /**
     * Gets the first round of the upper bracket.
     *
     * @param stageId ID of the stage.
     */
    private async getUpperBracketFirstRound(stageId: Id): Promise<Round> {
        // Considering the database is ordered, this round will always be the first round of the upper bracket.
        const firstRound = await this.storage.selectFirst('round', { stage_id: stageId, number: 1 }, false);
        if (!firstRound) throw Error('Round not found.');
        return firstRound;
    }

    /**
     * Gets the last round of a group.
     *
     * @param groupId ID of the group.
     */
    private async getLastRound(groupId: Id): Promise<Round> {
        const round = await this.storage.selectLast('round', { group_id: groupId }, false);
        if (!round) throw Error('Error getting rounds.');
        return round;
    }

    /**
     * Returns the id of the final group (containing consolation final, or grand final, or both).
     *
     * @param stageId ID of the stage.
     * @param stageType Type of the stage.
     */
    private async getFinalGroupId(stageId: Id, stageType: StageType): Promise<Id | null> {
        const groupNumber = stageType === 'single_elimination' ? 2 /* single bracket + final */ : 3 /* winner bracket + loser bracket + final */;
        const finalGroup = await this.storage.selectFirst('group', { stage_id: stageId, number: groupNumber });
        if (!finalGroup) return null;
        return finalGroup.id;
    }

    /**
     * Gets the upper bracket (the only bracket if single elimination or the winner bracket in double elimination).
     *
     * @param stageId ID of the stage.
     */
    protected async getUpperBracket(stageId: Id): Promise<Group> {
        const winnerBracket = await this.storage.selectFirst('group', { stage_id: stageId, number: 1 });
        if (!winnerBracket) throw Error('Winner bracket not found.');
        return winnerBracket;
    }

    /**
     * Gets the loser bracket.
     *
     * @param stageId ID of the stage.
     */
    protected async getLoserBracket(stageId: Id): Promise<Group | null> {
        return this.storage.selectFirst('group', { stage_id: stageId, number: 2 });
    }

    /**
     * Gets the corresponding match in the next round ("diagonal match") the usual way.
     *
     * Just like from Round 1 to Round 2 in a single elimination stage.
     *
     * @param groupId ID of the group.
     * @param roundNumber Number of the round in its parent group.
     * @param matchNumber Number of the match in its parent round.
     */
    private async getDiagonalMatch(groupId: Id, roundNumber: number, matchNumber: number): Promise<Match> {
        return this.findMatch(groupId, roundNumber + 1, helpers.getDiagonalMatchNumber(matchNumber));
    }

    /**
     * Gets the corresponding match in the next round ("parallel match") the "major round to minor round" way.
     *
     * Just like from Round 1 to Round 2 in the loser bracket of a double elimination stage.
     *
     * @param groupId ID of the group.
     * @param roundNumber Number of the round in its parent group.
     * @param matchNumber Number of the match in its parent round.
     */
    private async getParallelMatch(groupId: Id, roundNumber: number, matchNumber: number): Promise<Match> {
        return this.findMatch(groupId, roundNumber + 1, matchNumber);
    }

    /**
     * Finds a match in a given group. The match must have the given number in a round of which the number in group is given.
     *
     * **Example:** In group of id 1, give me the 4th match in the 3rd round.
     *
     * @param groupId ID of the group.
     * @param roundNumber Number of the round in its parent group.
     * @param matchNumber Number of the match in its parent round.
     */
    protected async findMatch(groupId: Id, roundNumber: number, matchNumber: number): Promise<Match> {
        const round = await this.storage.selectFirst('round', {
            group_id: groupId,
            number: roundNumber,
        });

        if (!round) throw Error('Round not found.');

        const match = await this.storage.selectFirst('match', {
            round_id: round.id,
            number: matchNumber,
        });

        if (!match) throw Error('Match not found.');

        return match;
    }

    /**
     * Finds a match game based on its `id` or based on the combination of its `parent_id` and `number`.
     * 
     * @param game Values to change in a match game.
     */
    protected async findMatchGame(game: DeepPartial<MatchGame>): Promise<MatchGame> {
        if (game.id !== undefined) {
            const stored = await this.storage.select('match_game', game.id);
            if (!stored) throw Error('Match game not found.');
            return stored;
        }

        if (game.parent_id !== undefined && game.number) {
            const stored = await this.storage.selectFirst('match_game', {
                parent_id: game.parent_id,
                number: game.number,
            });

            if (!stored) throw Error('Match game not found.');
            return stored;
        }

        throw Error('No match game id nor parent id and number given.');
    }
}

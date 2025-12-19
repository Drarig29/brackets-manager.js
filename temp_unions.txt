/**
 * The only supported types of stage.
 */
export type StageType = 'round_robin' | 'single_elimination' | 'double_elimination';
/**
 * All the possible types of group in an elimination stage.
 *
 * - `single_bracket` for single elimination.
 * - `winner_bracket` and `loser_bracket` for double elimination.
 * - `final_group` for both single and double elimination.
 */
export type GroupType = 'single_bracket' | 'winner_bracket' | 'loser_bracket' | 'final_group';
/**
 * The possible types for a double elimination stage's grand final.
 */
export type GrandFinalType = 'none' | 'simple' | 'double';
/**
 * The possible types of final for an elimination stage.
 */
export type FinalType = 'consolation_final' | 'grand_final';
/**
 * The possible modes for a round-robin stage.
 */
export type RoundRobinMode = 'simple' | 'double';
/**
 * Used to order seeds.
 */
export type SeedOrdering = 'natural' | 'reverse' | 'half_shift' | 'reverse_half_shift' | 'pair_flip' | 'inner_outer' | 'groups.effort_balanced' | 'groups.seed_optimized' | 'groups.bracket_optimized';
/**
 * The possible results of a duel for a participant.
 */
export type Result = 'win' | 'draw' | 'loss';
/**
 * Depending on your storage system, you might prefer strings or numbers.
 */
export type Id = string | number;

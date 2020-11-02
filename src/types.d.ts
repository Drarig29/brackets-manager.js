import { SeedOrdering } from 'brackets-model';

/**
 * Type of an object implementing every ordering method.
 */
export type OrderingMap = { [key in SeedOrdering]: <T>(array: T[], ...args: number[]) => T[] };

/**
 * Omits the `id` property of a type.
 */
export type OmitId<T> = Omit<T, 'id'>;

/**
 * Used by the library to handle placements. Is `null` if is a BYE. Has a `null` name if it's yet to be determined.
 */
export type ParticipantSlot = { id: number | null, position?: number } | null;

/**
 * The library only handles duels. It's one participant versus another participant.
 */
export type Duel = [ParticipantSlot, ParticipantSlot];

/**
 * The side of an opponent.
 */
export type Side = 'opponent1' | 'opponent2';

/**
 * The cumulated scores of the opponents in a match's child games.
 */
export type Scores = { opponent1: number, opponent2: number };
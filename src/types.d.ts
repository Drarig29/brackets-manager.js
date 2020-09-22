/**
 * Type of an object implementing every ordering method.
 */
type OrderingMap = { [key in import('brackets-model').SeedOrdering]: <T>(array: T[], ...args: any) => T[] };

/**
 * Omits the `id` property of a type.
 */
type OmitId<T> = Omit<T, 'id'>;

/**
 * Used by the library to handle placements. Is `null` if is a BYE. Has a `null` name if it's yet to be determined.
 */
type ParticipantSlot = { id: number | null, position?: number } | null;

/**
 * The library only handles duels. It's one participant versus another participant.
 */
type Duel = ParticipantSlot[];

/**
 * A list of duels.
 */
type Duels = Duel[];

/**
 * The side of an opponent.
 */
type Side = 'opponent1' | 'opponent2';

/**
 * The cumulated scores of the opponents in a match's child games.
 */
type Scores = { opponent1: number, opponent2: number };
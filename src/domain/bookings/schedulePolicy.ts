/**
 * Whether a goalkeeper can physically make two matches (FR-008): the match plus the time needed
 * to travel before and after it. The single rule used both to filter the available list and,
 * inside the acceptance transaction, to refuse a clashing acceptance.
 */

/** What the rule needs of a booking (a candidate or one the goalkeeper already holds). */
export interface Commitment {
  id: string;
  requestId: string;
  startsAt: Date;
  endsAt: Date;
  travelBufferMinutes: number;
}

/**
 * A and B clash when `A.start < B.end + m` and `B.start < A.end + m` (strict: touching the margin
 * is fine). `m` is the larger of the two margins, so the rule is symmetric and never under-estimates
 * the travel time when the matches come from cities with different margins (research.md §2).
 */
export function clashes(a: Commitment, b: Commitment): boolean {
  const marginMs = Math.max(a.travelBufferMinutes, b.travelBufferMinutes) * 60_000;
  return (
    a.startsAt.getTime() < b.endsAt.getTime() + marginMs && b.startsAt.getTime() < a.endsAt.getTime() + marginMs
  );
}

/** The first held booking that clashes with the candidate (the candidate itself is ignored). */
export function firstConflict(candidate: Commitment, held: readonly Commitment[]): Commitment | null {
  return held.find((other) => other.id !== candidate.id && clashes(candidate, other)) ?? null;
}

/** A goalkeeper takes at most one booking of a request — one match needs different goalkeepers. */
export function holdsSameRequest(candidate: Commitment, held: readonly Commitment[]): boolean {
  return held.some((other) => other.id !== candidate.id && other.requestId === candidate.requestId);
}

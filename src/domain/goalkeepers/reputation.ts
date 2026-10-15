/** Rated services a goalkeeper needs before reputation can verify them (admin spec 030, FR-012). */
export const REPUTATION_MIN_RATINGS = 5;
/** The average they must be strictly above. */
export const REPUTATION_MIN_AVERAGE = 4;

/**
 * Whether the clients' ratings verify the goalkeeper on their own: at least 5 rated services, not
 * necessarily in a row, with an average strictly above 4.0 (clarification 4: every rating counts,
 * also those before the validation).
 */
export function qualifiesForReputation(summary: { count: number; average: number | null }): boolean {
  return summary.count >= REPUTATION_MIN_RATINGS && summary.average !== null && summary.average > REPUTATION_MIN_AVERAGE;
}

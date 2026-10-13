/**
 * A user blocked by the administration can't sign in nor renew a session (admin spec 005,
 * FR-026–FR-030). The state lives in `userBlocks`; the rules about its reason live here.
 */
export const BLOCK_REASON_MIN = 3;
export const BLOCK_REASON_MAX = 300;

/** Why the reason of a block or unblock is refused, or `null` when it is fine (trimmed). */
export function blockReasonIssue(reason: string): string | null {
  const length = reason.trim().length;
  if (length < BLOCK_REASON_MIN) return `The reason needs at least ${BLOCK_REASON_MIN} characters.`;
  if (length > BLOCK_REASON_MAX) return `The reason takes at most ${BLOCK_REASON_MAX} characters.`;
  return null;
}

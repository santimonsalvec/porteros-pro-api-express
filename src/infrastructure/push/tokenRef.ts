import { createHash } from 'node:crypto';
import type { ITokenFingerprint } from '../../application/features/devices/common/ports.js';

/** The `devices._id` of a token: fixed size, one document per token (research §2). */
export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** What logs carry instead of the token (FR-022): the start of the same hash. */
export function tokenRef(token: string): string {
  return tokenHash(token).slice(0, 12);
}

export const sha256TokenFingerprint: ITokenFingerprint = { ref: tokenRef };

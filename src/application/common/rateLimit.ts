import type { RateLimitDecision } from '../features/devices/common/ports.js';

export type { RateLimitDecision };

/**
 * A limit that survives restarts and is shared by every instance (admin spec 009, research §6): the
 * sign-in code's limit per network address. The test push keeps its in-memory `IRateLimiter`.
 */
export interface IDurableRateLimiter {
  tryConsume(key: string, limit: number, windowSeconds: number, now: Date): Promise<RateLimitDecision>;
}

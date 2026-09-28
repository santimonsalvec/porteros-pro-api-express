import type { IRateLimiter, RateLimitDecision } from '../../application/features/devices/common/ports.js';

/**
 * A fixed window per key, in memory (research §10). Only used by the test push: a restart
 * merely resets a developer tool's counter.
 */
export class InMemoryRateLimiter implements IRateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();

  tryConsume(key: string, limit: number, windowSeconds: number, now: Date): RateLimitDecision {
    const at = now.getTime();
    const windowMs = windowSeconds * 1000;
    for (const [other, window] of this.windows) {
      if (at - window.startedAt >= windowMs) this.windows.delete(other);
    }

    const window = this.windows.get(key) ?? { startedAt: at, count: 0 };
    if (window.count >= limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window.startedAt + windowMs - at) / 1000)) };
    }
    window.count += 1;
    this.windows.set(key, window);
    return { allowed: true };
  }
}

import type { IDurableRateLimiter, RateLimitDecision } from '../../src/application/common/rateLimit.js';

/** Fixed windows in memory, like `MongoRateLimiter`; `calls` records every key asked for. */
export class FakeDurableRateLimiter implements IDurableRateLimiter {
  readonly calls: { key: string; limit: number; windowSeconds: number }[] = [];
  private readonly windows = new Map<string, { startedAt: number; count: number }>();

  async tryConsume(key: string, limit: number, windowSeconds: number, now: Date): Promise<RateLimitDecision> {
    this.calls.push({ key, limit, windowSeconds });
    const windowMs = windowSeconds * 1000;
    const current = this.windows.get(key);
    const window = current && now.getTime() - current.startedAt < windowMs ? current : { startedAt: now.getTime(), count: 0 };
    window.count += 1;
    this.windows.set(key, window);
    if (window.count <= limit) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window.startedAt + windowMs - now.getTime()) / 1000)) };
  }
}

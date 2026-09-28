import type { IRateLimiter, RateLimitDecision } from '../../src/application/features/devices/common/ports.js';

export class FakeRateLimiter implements IRateLimiter {
  private decision: RateLimitDecision = { allowed: true };
  readonly calls: Array<{ key: string; limit: number; windowSeconds: number }> = [];

  allowAll(): void {
    this.decision = { allowed: true };
  }

  denyWith(retryAfterSeconds: number): void {
    this.decision = { allowed: false, retryAfterSeconds };
  }

  tryConsume(key: string, limit: number, windowSeconds: number): RateLimitDecision {
    this.calls.push({ key, limit, windowSeconds });
    return this.decision;
  }
}

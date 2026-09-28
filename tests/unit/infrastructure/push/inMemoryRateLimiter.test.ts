import { describe, expect, it } from 'vitest';
import { InMemoryRateLimiter } from '../../../../src/infrastructure/push/inMemoryRateLimiter.js';

const at = (seconds: number) => new Date(Date.UTC(2026, 8, 28, 18, 0, seconds));

describe('InMemoryRateLimiter', () => {
  it('allows the limit within a window, then refuses with the seconds left', () => {
    const limiter = new InMemoryRateLimiter();
    for (let call = 0; call < 5; call += 1) {
      expect(limiter.tryConsume('k', 5, 60, at(call))).toEqual({ allowed: true });
    }

    expect(limiter.tryConsume('k', 5, 60, at(20))).toEqual({ allowed: false, retryAfterSeconds: 40 });
  });

  it('starts a new window once the previous one has passed', () => {
    const limiter = new InMemoryRateLimiter();
    for (let call = 0; call < 5; call += 1) limiter.tryConsume('k', 5, 60, at(0));

    expect(limiter.tryConsume('k', 5, 60, new Date(at(0).getTime() + 60_000))).toEqual({ allowed: true });
  });

  it('counts each key on its own', () => {
    const limiter = new InMemoryRateLimiter();
    limiter.tryConsume('a', 1, 60, at(0));

    expect(limiter.tryConsume('a', 1, 60, at(1)).allowed).toBe(false);
    expect(limiter.tryConsume('b', 1, 60, at(1)).allowed).toBe(true);
  });
});

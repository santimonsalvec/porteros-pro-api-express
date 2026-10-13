import { describe, expect, it } from 'vitest';
import {
  CHECK_LEASE_SECONDS,
  CHECK_LOG_MAX,
  canReconcile,
  expiresAtOf,
  isSameCheck,
  TOP_UP_STATUSES,
  type TopUpCheck,
} from '../../../../src/domain/payments/topUp.js';

// Admin spec 007: what each ask to the gateway leaves on the top-up (research §1–§2).

const check = (overrides: Partial<TopUpCheck> = {}): TopUpCheck => ({
  at: new Date('2026-10-13T20:30:00.000Z'),
  lastAt: new Date('2026-10-13T20:30:00.000Z'),
  by: 'sweep',
  staffUserId: null,
  answer: 'PENDING',
  result: 'still_pending',
  statusAfter: 'pending',
  repeats: 1,
  ...overrides,
});

describe('top-up checks', () => {
  it('keeps the last 50 checks and holds a check for 30 seconds', () => {
    expect(CHECK_LOG_MAX).toBe(50);
    expect(CHECK_LEASE_SECONDS).toBe(30);
  });

  it('lets an administrator reconcile only a pending or an expired top-up', () => {
    const allowed = TOP_UP_STATUSES.filter(canReconcile);
    expect(allowed).toEqual(['pending', 'expired']);
  });

  it('expires 48 hours after it was created', () => {
    expect(expiresAtOf(new Date('2026-10-13T21:15:00.000Z'))).toEqual(new Date('2026-10-15T21:15:00.000Z'));
  });

  it('treats two checks as the same when the same kind of caller got the same answer', () => {
    expect(isSameCheck(check({ answer: 'UNAVAILABLE', result: 'failed' }), check({ answer: 'UNAVAILABLE', result: 'failed' }))).toBe(true);
    expect(isSameCheck(check(), check({ answer: 'APPROVED', result: 'applied' }))).toBe(false);
    expect(isSameCheck(check({ by: 'staff', staffUserId: 'u-1' }), check())).toBe(false);
    expect(isSameCheck(check({ by: 'staff', staffUserId: 'u-1' }), check({ by: 'staff', staffUserId: 'u-2' }))).toBe(false);
  });
});

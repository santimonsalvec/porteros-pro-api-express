import { describe, expect, it } from 'vitest';
import { ADMIN_SESSION_ABSOLUTE_MS, ADMIN_SESSION_IDLE_MS, AdminSession } from '../../../../src/domain/staff/adminSession.js';

const NOW = new Date('2026-10-08T14:00:00.000Z');
const MINUTE = 60 * 1000;
const at = (ms: number) => new Date(NOW.getTime() + ms);

const start = () =>
  AdminSession.start({ id: 'sid-1', staffId: 'staff-1', userId: 'user-1', refreshTokenHash: 'h1', userAgent: 'x'.repeat(400), ip: '1.2.3.4' }, NOW);

describe('AdminSession', () => {
  it('lasts 12 hours at most and 30 minutes without use', () => {
    const session = start();

    expect(ADMIN_SESSION_ABSOLUTE_MS).toBe(12 * 60 * MINUTE);
    expect(ADMIN_SESSION_IDLE_MS).toBe(30 * MINUTE);
    expect(session).toMatchObject({
      startedAt: NOW,
      absoluteExpiresAt: at(12 * 60 * MINUTE),
      idleExpiresAt: at(30 * MINUTE),
      previousRefreshTokenHash: null,
      revokedAt: null,
      revokedReason: null,
    });
    expect(session.userAgent).toHaveLength(300);
    expect(session.isValid(at(30 * MINUTE - 1))).toBe(true);
    expect(session.isValid(at(30 * MINUTE))).toBe(false);
  });

  it('rotating keeps the previous hash and slides the idle limit', () => {
    const rotated = start().rotate('h2', at(20 * MINUTE));

    expect(rotated).toMatchObject({ refreshTokenHash: 'h2', previousRefreshTokenHash: 'h1', idleExpiresAt: at(50 * MINUTE) });
    expect(rotated.isValid(at(45 * MINUTE))).toBe(true);
  });

  it('the idle limit never passes the 12-hour limit', () => {
    const late = start().rotate('h2', at(11 * 60 * MINUTE + 50 * MINUTE));

    expect(late.idleExpiresAt).toEqual(at(12 * 60 * MINUTE));
    expect(late.isValid(at(12 * 60 * MINUTE))).toBe(false);
  });

  it('a revoked session is no longer valid', () => {
    const revoked = start().revoke('sign_out', at(MINUTE));

    expect(revoked).toMatchObject({ revokedAt: at(MINUTE), revokedReason: 'sign_out' });
    expect(revoked.isValid(at(2 * MINUTE))).toBe(false);
  });
});

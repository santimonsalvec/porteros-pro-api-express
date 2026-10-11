import { beforeEach, describe, expect, it } from 'vitest';
import { RefreshAdminSessionCommand } from '../../../../../src/application/features/staff/commands/refreshAdminSession/refreshAdminSessionCommand.js';
import { RefreshAdminSessionCommandHandler } from '../../../../../src/application/features/staff/commands/refreshAdminSession/refreshAdminSessionCommandHandler.js';
import { AdminSession } from '../../../../../src/domain/staff/adminSession.js';
import { MINUTE, staffHarness } from './staffHarness.js';

describe('RefreshAdminSessionCommandHandler', () => {
  let h: ReturnType<typeof staffHarness>;
  let handler: RefreshAdminSessionCommandHandler;
  const refresh = (raw: string) => handler.handle(new RefreshAdminSessionCommand(raw));

  beforeEach(async () => {
    h = staffHarness();
    handler = new RefreshAdminSessionCommandHandler({
      members: h.members,
      sessions: h.sessions,
      tokens: h.tokens,
      clock: h.clock,
      securityLog: h.securityLog,
      accessResolver: h.resolver,
    });
    await h.activeMember('staff-1', 'ana@example.com', 'owner', 'user-1');
    await h.sessions.add(
      AdminSession.start({ id: 'sid-1', staffId: 'staff-1', userId: 'user-1', refreshTokenHash: h.tokens.hashRefreshToken('rt-1'), userAgent: '', ip: '' }, h.clock.now()),
    );
  });

  it('rotates the refresh value, issues a new access token and slides the idle limit', async () => {
    h.clock.advance(10 * MINUTE);

    const result = await refresh('rt-1');

    expect(result).toMatchObject({ outcome: 'refreshed', expiresInSeconds: 300 });
    if (result.outcome !== 'refreshed') throw new Error('unreachable');
    const session = (await h.sessions.getById('sid-1'))!;
    expect(session.refreshTokenHash).toBe(h.tokens.hashRefreshToken(result.refreshToken));
    expect(session.previousRefreshTokenHash).toBe(h.tokens.hashRefreshToken('rt-1'));
    expect(session.idleExpiresAt).toEqual(new Date(h.clock.now().getTime() + 30 * MINUTE));
    expect(await h.tokens.verifyAccessToken(result.accessToken)).toEqual({ userId: 'user-1', sessionId: 'sid-1', staffId: 'staff-1' });
  });

  it('rejects an unknown value', async () => {
    expect(await refresh('nope')).toEqual({ outcome: 'invalid_refresh_token' });
  });

  it('rejects after 30 minutes without use', async () => {
    h.clock.advance(30 * MINUTE);

    expect(await refresh('rt-1')).toEqual({ outcome: 'invalid_refresh_token' });
  });

  it('rejects after 12 hours even when refreshed every 5 minutes', async () => {
    let raw = 'rt-1';
    for (let elapsed = 0; elapsed < 12 * 60 - 5; elapsed += 5) {
      h.clock.advance(5 * MINUTE);
      const result = await refresh(raw);
      if (result.outcome !== 'refreshed') throw new Error(`refused at ${elapsed + 5} min`);
      raw = result.refreshToken;
    }
    h.clock.advance(5 * MINUTE);

    expect(await refresh(raw)).toEqual({ outcome: 'invalid_refresh_token' });
  });

  it('revokes the session when the previous value comes back', async () => {
    const first = await refresh('rt-1');
    if (first.outcome !== 'refreshed') throw new Error('unreachable');

    expect(await refresh('rt-1')).toEqual({ outcome: 'invalid_refresh_token' });
    expect((await h.sessions.getById('sid-1'))!.revokedReason).toBe('refresh_reuse');
    expect(await refresh(first.refreshToken)).toEqual({ outcome: 'invalid_refresh_token' });
    expect(h.invalidated).toContain('sid-1');
    expect(h.securityLog.events.at(-2)).toEqual({ event: 'admin_refresh', outcome: 'refresh_reuse', staffId: 'staff-1', sessionId: 'sid-1' });
  });

  it('rejects when the member was disabled', async () => {
    await h.members.update((await h.members.getById('staff-1'))!.disable(h.clock.now()));

    expect(await refresh('rt-1')).toEqual({ outcome: 'invalid_refresh_token' });
  });
});

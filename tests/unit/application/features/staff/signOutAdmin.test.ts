import { beforeEach, describe, expect, it } from 'vitest';
import { SignOutAdminCommand } from '../../../../../src/application/features/staff/commands/signOutAdmin/signOutAdminCommand.js';
import { SignOutAdminCommandHandler } from '../../../../../src/application/features/staff/commands/signOutAdmin/signOutAdminCommandHandler.js';
import { AdminSession } from '../../../../../src/domain/staff/adminSession.js';
import { staffHarness } from './staffHarness.js';

describe('SignOutAdminCommandHandler', () => {
  let h: ReturnType<typeof staffHarness>;
  let handler: SignOutAdminCommandHandler;

  beforeEach(async () => {
    h = staffHarness();
    handler = new SignOutAdminCommandHandler({ sessions: h.sessions, tokens: h.tokens, clock: h.clock, securityLog: h.securityLog, accessResolver: h.resolver });
    for (const [id, raw] of [['sid-laptop', 'rt-laptop'], ['sid-tablet', 'rt-tablet']]) {
      await h.sessions.add(
        AdminSession.start({ id: id!, staffId: 'staff-1', userId: 'user-1', refreshTokenHash: h.tokens.hashRefreshToken(raw!), userAgent: '', ip: '' }, h.clock.now()),
      );
    }
  });

  it("revokes only this browser's session", async () => {
    expect(await handler.handle(new SignOutAdminCommand('rt-laptop'))).toEqual({ outcome: 'signed_out' });

    expect((await h.sessions.getById('sid-laptop'))!.revokedReason).toBe('sign_out');
    expect((await h.sessions.getById('sid-tablet'))!.revokedAt).toBeNull();
    expect(h.invalidated).toEqual(['sid-laptop']);
    expect(h.securityLog.events).toEqual([{ event: 'admin_sign_out', outcome: 'signed_out', staffId: 'staff-1', sessionId: 'sid-laptop' }]);
  });

  it('does nothing, without failing, without a value or with an unknown one', async () => {
    expect(await handler.handle(new SignOutAdminCommand(null))).toEqual({ outcome: 'signed_out' });
    expect(await handler.handle(new SignOutAdminCommand('nope'))).toEqual({ outcome: 'signed_out' });
    expect([...h.sessions.sessions.values()].every((session) => session.revokedAt === null)).toBe(true);
  });
});

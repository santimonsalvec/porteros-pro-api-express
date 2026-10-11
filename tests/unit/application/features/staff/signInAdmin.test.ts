import { beforeEach, describe, expect, it } from 'vitest';
import { SignInAdminCommand } from '../../../../../src/application/features/staff/commands/signInAdmin/signInAdminCommand.js';
import { SignInAdminCommandHandler } from '../../../../../src/application/features/staff/commands/signInAdmin/signInAdminCommandHandler.js';
import { DAY, MINUTE, staffHarness } from './staffHarness.js';
import { StaffMember } from '../../../../../src/domain/staff/staffMember.js';

describe('SignInAdminCommandHandler — active members (US1)', () => {
  let h: ReturnType<typeof staffHarness>;
  let handler: SignInAdminCommandHandler;
  const signIn = (credential: string) => handler.handle(new SignInAdminCommand(credential, 'Firefox', '1.2.3.4'));

  beforeEach(async () => {
    h = staffHarness();
    handler = new SignInAdminCommandHandler({
      google: h.google,
      users: h.users,
      members: h.members,
      sessions: h.sessions,
      tokens: h.tokens,
      ids: h.ids,
      clock: h.clock,
      securityLog: h.securityLog,
    });
    await h.account('user-1', 'ana@example.com');
    await h.activeMember('staff-1', 'ana@example.com', 'owner', 'user-1');
    h.credential('cred-ana', 'Ana@Example.com', 'sub-user-1');
  });

  it('opens a session for an active member with the linked Google account', async () => {
    h.clock.advance(5 * MINUTE);

    const result = await signIn('cred-ana');

    expect(result).toMatchObject({
      outcome: 'signed_in',
      accessToken: expect.any(String),
      expiresInSeconds: 300,
      refreshToken: expect.any(String),
      session: { startedAt: h.clock.now(), absoluteExpiresAt: new Date(h.clock.now().getTime() + 12 * 60 * MINUTE) },
    });
    if (result.outcome !== 'signed_in') throw new Error('unreachable');
    const [session] = h.sessions.sessions.values();
    expect(session).toMatchObject({ staffId: 'staff-1', userId: 'user-1', userAgent: 'Firefox', ip: '1.2.3.4' });
    expect(session!.refreshTokenHash).toBe(h.tokens.hashRefreshToken(result.refreshToken));
    expect(await h.tokens.verifyAccessToken(result.accessToken)).toEqual({ userId: 'user-1', sessionId: session!.id, staffId: 'staff-1' });
    expect((await h.members.getById('staff-1'))!.lastSignInAt).toEqual(h.clock.now());
    expect(h.securityLog.events).toEqual([{ event: 'admin_sign_in', outcome: 'signed_in', staffId: 'staff-1', sessionId: session!.id }]);
  });

  it('rejects a credential Google does not confirm', async () => {
    expect(await signIn('forged')).toEqual({ outcome: 'invalid_credential' });
    expect(h.securityLog.events).toEqual([{ event: 'admin_sign_in', outcome: 'invalid_credential' }]);
  });

  it('rejects an email with no staff member, without creating an account or a session', async () => {
    h.credential('cred-luis', 'luis@example.com', 'sub-luis');

    expect(await signIn('cred-luis')).toEqual({ outcome: 'unauthorized_admin_account' });
    expect(await h.users.findByExternalIdentity('google', 'sub-luis')).toBeNull();
    expect(h.sessions.sessions.size).toBe(0);
    expect(JSON.stringify(h.securityLog.events)).not.toContain('luis@example.com');
  });

  it('rejects a disabled member', async () => {
    await h.members.update((await h.members.getById('staff-1'))!.disable(h.clock.now()));

    expect(await signIn('cred-ana')).toEqual({ outcome: 'unauthorized_admin_account' });
    expect(h.sessions.sessions.size).toBe(0);
  });

  it('rejects the same email from another Google account', async () => {
    h.credential('cred-other', 'ana@example.com', 'sub-someone-else');

    expect(await signIn('cred-other')).toEqual({ outcome: 'unauthorized_admin_account' });
  });
});

describe('SignInAdminCommandHandler — invitations (US4)', () => {
  let h: ReturnType<typeof staffHarness>;
  let handler: SignInAdminCommandHandler;
  const signIn = (credential: string) => handler.handle(new SignInAdminCommand(credential, 'Firefox', '1.2.3.4'));

  beforeEach(async () => {
    h = staffHarness();
    handler = new SignInAdminCommandHandler({
      google: h.google,
      users: h.users,
      members: h.members,
      sessions: h.sessions,
      tokens: h.tokens,
      ids: h.ids,
      clock: h.clock,
      securityLog: h.securityLog,
    });
    await h.role('soporte', ['cases.read']);
    await h.members.add(StaffMember.invite({ id: 'staff-1', email: 'ana@example.com', roleId: 'soporte', invitedBy: 'system:script' }, h.clock.now()));
  });

  it('activates a valid invitation and creates the account when it did not exist', async () => {
    h.credential('cred', ' ANA@example.com ', 'sub-ana', true, 'Ana Pérez');

    const result = await signIn('cred');

    expect(result.outcome).toBe('signed_in');
    const user = await h.users.findByExternalIdentity('google', 'sub-ana');
    expect(user).toMatchObject({ email: 'ana@example.com' });
    expect(await h.members.getById('staff-1')).toMatchObject({ status: 'active', userId: user!.id, displayName: 'Ana Pérez', inviteExpiresAt: null });
    expect(h.sessions.sessions.size).toBe(1);
  });

  it('links an account that already used the app instead of creating another', async () => {
    const user = await h.account('user-app', 'ana@example.com', 'sub-ana');
    h.credential('cred', 'ana@example.com', 'sub-ana');

    await signIn('cred');

    expect((await h.members.getById('staff-1'))!.userId).toBe(user.id);
    expect(await h.users.getAll()).toHaveLength(1);
  });

  it('refuses an unverified email', async () => {
    h.credential('cred', 'ana@example.com', 'sub-ana', false);

    expect(await signIn('cred')).toEqual({ outcome: 'unauthorized_admin_account' });
    expect(await h.users.getAll()).toHaveLength(0);
  });

  it('refuses an invitation older than 7 days, creating nothing', async () => {
    h.credential('cred', 'ana@example.com', 'sub-ana');
    h.clock.advance(8 * DAY);

    expect(await signIn('cred')).toEqual({ outcome: 'unauthorized_admin_account' });
    expect(await h.users.getAll()).toHaveLength(0);
    expect((await h.members.getById('staff-1'))!.status).toBe('invited');
  });

  it("refuses an account already linked to another staff member", async () => {
    await h.account('user-app', 'otra@example.com', 'sub-ana');
    await h.activeMember('staff-9', 'otra@example.com', 'soporte', 'user-app');
    h.credential('cred', 'ana@example.com', 'sub-ana');

    expect(await signIn('cred')).toEqual({ outcome: 'unauthorized_admin_account' });
  });
});


import { describe, expect, it } from 'vitest';
import { RequestAdminEmailCodeCommand } from '../../../../../src/application/features/staff/commands/requestAdminEmailCode/requestAdminEmailCodeCommand.js';
import { RequestAdminEmailCodeCommandHandler } from '../../../../../src/application/features/staff/commands/requestAdminEmailCode/requestAdminEmailCodeCommandHandler.js';
import { VerifyAdminEmailCodeCommand } from '../../../../../src/application/features/staff/commands/verifyAdminEmailCode/verifyAdminEmailCodeCommand.js';
import { VerifyAdminEmailCodeCommandHandler } from '../../../../../src/application/features/staff/commands/verifyAdminEmailCode/verifyAdminEmailCodeCommandHandler.js';
import { requestLoginCode } from '../../../../../src/application/features/auth/common/requestLoginCode.js';
import { StaffMember } from '../../../../../src/domain/staff/staffMember.js';
import { User } from '../../../../../src/domain/users/user.js';
import { loginCodeHarness } from '../auth/loginCodeHarness.js';
import { DAY, staffHarness } from './staffHarness.js';

/** The staff fakes and the sign-in code's, on one clock; `waited` records the response floor. */
function adminHarness() {
  const staff = staffHarness();
  const codes = loginCodeHarness();
  codes.deps.clock = staff.clock;
  const waited: number[] = [];
  let elapsedMs = 0;
  // Each request's stopwatch reads `elapsedMs`: what the request took before the floor.
  const timer = { stopwatch: () => () => elapsedMs, sleep: async (ms: number) => void waited.push(ms) };
  const deps = { ...staff, loginCodes: codes.deps, timer, minResponseMs: 800 };
  const request = new RequestAdminEmailCodeCommandHandler(deps);
  const verify = new VerifyAdminEmailCodeCommandHandler(deps);
  return {
    ...staff,
    codes,
    waited,
    setElapsed: (ms: number) => (elapsedMs = ms),
    ask: (email: string) => request.handle(new RequestAdminEmailCodeCommand(email, '1.2.3.4')),
    check: (email: string, code: string) => verify.handle(new VerifyAdminEmailCodeCommand(email, code, 'Firefox', '1.2.3.4')),
  };
}

describe('RequestAdminEmailCodeCommandHandler (admin spec 009, US3)', () => {
  it('sends a code to an active member and to a valid invitation', async () => {
    const h = adminHarness();
    await h.activeMember('staff-1', 'ana@porteros.pro', 'owner', 'user-1');
    await h.members.add(StaffMember.invite({ id: 'staff-2', email: 'luis@porteros.pro', roleId: 'owner', invitedBy: 'staff-1' }, h.clock.now()));

    expect((await h.ask('Ana@Porteros.pro')).outcome).toBe('sent');
    expect((await h.ask('luis@porteros.pro')).outcome).toBe('sent');
    expect(h.codes.mailer.sent.map((email) => email.to)).toEqual(['ana@porteros.pro', 'luis@porteros.pro']);
  });

  it("sends the email in the member's language, from their linked user (feature 032)", async () => {
    const h = adminHarness();
    await h.activeMember('staff-1', 'ana@porteros.pro', 'owner', 'user-1');
    const user = User.createFromExternalIdentity({ id: 'user-1', email: 'ana@porteros.pro', displayName: null, provider: 'google', subject: 'sub-user-1' });
    user.preferredLanguage = 'en';
    await h.users.add(user);

    await h.ask('ana@porteros.pro');

    expect(h.codes.mailer.sent.map((email) => [email.to, email.language])).toEqual([['ana@porteros.pro', 'en']]);
  });

  it('answers the same to an address without access, and sends nothing', async () => {
    const h = adminHarness();
    await h.activeMember('staff-1', 'ana@porteros.pro', 'owner', 'user-1');
    const disabled = StaffMember.invite({ id: 'staff-2', email: 'off@porteros.pro', roleId: 'owner', invitedBy: 'x' }, h.clock.now())
      .activate('user-2', null, h.clock.now())
      .disable(h.clock.now());
    await h.members.add(disabled);
    await h.members.add(StaffMember.invite({ id: 'staff-3', email: 'old@porteros.pro', roleId: 'owner', invitedBy: 'x' }, new Date(h.clock.now().getTime() - 8 * DAY)));

    const member = await h.ask('ana@porteros.pro');
    const answers = [await h.ask('nadie@porteros.pro'), await h.ask('off@porteros.pro'), await h.ask('old@porteros.pro')];

    const withoutAddress = (answer: object) => ({ ...answer, email: undefined });
    for (const answer of answers) expect(withoutAddress(answer)).toEqual(withoutAddress(member));
    expect(h.codes.mailer.sent).toHaveLength(1);
  });

  it('never answers before the floor, whoever asks', async () => {
    const h = adminHarness();
    await h.activeMember('staff-1', 'ana@porteros.pro', 'owner', 'user-1');

    h.setElapsed(300);
    await h.ask('ana@porteros.pro');
    h.setElapsed(10);
    await h.ask('nadie@porteros.pro');
    h.setElapsed(950);
    await h.ask('otra@porteros.pro');

    expect(h.waited).toEqual([500, 790]);
  });

  it('logs each request in the security log with the address masked', async () => {
    const h = adminHarness();
    await h.activeMember('staff-1', 'ana@porteros.pro', 'owner', 'user-1');

    await h.ask('ana@porteros.pro');
    await h.ask('nadie@porteros.pro');

    expect(h.securityLog.events).toEqual([
      { event: 'admin_email_code', outcome: 'sent', emailMasked: 'a***@porteros.pro' },
      { event: 'admin_email_code', outcome: 'no_access', emailMasked: 'n***@porteros.pro' },
    ]);
  });
});

describe('VerifyAdminEmailCodeCommandHandler (admin spec 009, US3)', () => {
  it('opens a session for an active member, like Google does', async () => {
    const h = adminHarness();
    await h.activeMember('staff-1', 'ana@porteros.pro', 'owner', 'user-1');
    await h.ask('ana@porteros.pro');

    const result = await h.check('ana@porteros.pro', h.codes.mailer.lastCode());

    expect(result).toMatchObject({ outcome: 'signed_in', accessToken: expect.any(String), refreshToken: expect.any(String) });
    const [session] = [...h.sessions.sessions.values()];
    expect(session).toMatchObject({ staffId: 'staff-1', userId: 'user-1', userAgent: 'Firefox', ip: '1.2.3.4' });
    expect(h.securityLog.events.at(-1)).toMatchObject({ event: 'admin_sign_in', outcome: 'signed_in', method: 'email_code' });
  });

  it('activates a valid invitation with the account of that address', async () => {
    const h = adminHarness();
    await h.roles.ensureOwner(h.clock.now());
    h.users.seed(User.createFromVerifiedEmail({ id: 'app-user', email: 'luis@porteros.pro' }));
    await h.members.add(StaffMember.invite({ id: 'staff-2', email: 'luis@porteros.pro', roleId: 'owner', invitedBy: 'staff-1' }, h.clock.now()));
    await h.ask('luis@porteros.pro');

    expect((await h.check('luis@porteros.pro', h.codes.mailer.lastCode())).outcome).toBe('signed_in');
    expect(await h.members.getById('staff-2')).toMatchObject({ status: 'active', userId: 'app-user' });
  });

  it('activates a valid invitation with a new account when the address has none', async () => {
    const h = adminHarness();
    await h.roles.ensureOwner(h.clock.now());
    await h.members.add(StaffMember.invite({ id: 'staff-2', email: 'luis@porteros.pro', roleId: 'owner', invitedBy: 'staff-1' }, h.clock.now()));
    await h.ask('luis@porteros.pro');

    expect((await h.check('luis@porteros.pro', h.codes.mailer.lastCode())).outcome).toBe('signed_in');
    const user = await h.users.findByEmailKey('luis@porteros.pro');
    expect(user).not.toBeNull();
    expect(await h.members.getById('staff-2')).toMatchObject({ status: 'active', userId: user!.id });
  });

  it('refuses an invitation whose account already belongs to another member', async () => {
    const h = adminHarness();
    await h.activeMember('staff-1', 'ana@porteros.pro', 'owner', 'shared-user');
    h.users.seed(User.createFromVerifiedEmail({ id: 'shared-user', email: 'luis@porteros.pro' }));
    await h.members.add(StaffMember.invite({ id: 'staff-2', email: 'luis@porteros.pro', roleId: 'owner', invitedBy: 'staff-1' }, h.clock.now()));
    await h.ask('luis@porteros.pro');

    expect(await h.check('luis@porteros.pro', h.codes.mailer.lastCode())).toEqual({ outcome: 'invalid_code' });
    expect(await h.members.getById('staff-2')).toMatchObject({ status: 'invited' });
  });

  it('refuses any code for an address without access', async () => {
    const h = adminHarness();
    await h.ask('nadie@porteros.pro');

    expect(await h.check('nadie@porteros.pro', '100001')).toEqual({ outcome: 'invalid_code' });
    expect([...h.sessions.sessions.values()]).toEqual([]);
  });

  it('refuses a member disabled after the code was sent', async () => {
    const h = adminHarness();
    const member = await h.activeMember('staff-1', 'ana@porteros.pro', 'owner', 'user-1');
    await h.ask('ana@porteros.pro');
    await h.members.update(member.disable(h.clock.now()));

    expect(await h.check('ana@porteros.pro', h.codes.mailer.lastCode())).toEqual({ outcome: 'invalid_code' });
  });

  it('refuses a code asked for the app', async () => {
    const h = adminHarness();
    await h.activeMember('staff-1', 'ana@porteros.pro', 'owner', 'user-1');
    await requestLoginCode(h.codes.deps, { audience: 'app', email: 'ana@porteros.pro', ip: '1.2.3.4', deliver: async () => true });

    expect(await h.check('ana@porteros.pro', h.codes.mailer.lastCode())).toEqual({ outcome: 'invalid_code' });
  });

  it('refuses an expired code and too many attempts', async () => {
    const h = adminHarness();
    await h.activeMember('staff-1', 'ana@porteros.pro', 'owner', 'user-1');
    await h.ask('ana@porteros.pro');
    const code = h.codes.mailer.lastCode();
    for (let attempt = 0; attempt < 2; attempt += 1) await h.check('ana@porteros.pro', '999999');

    expect(await h.check('ana@porteros.pro', '999999')).toEqual({ outcome: 'too_many_attempts' });
    expect(await h.check('ana@porteros.pro', code)).toEqual({ outcome: 'too_many_attempts' });

    h.clock.advance(60 * 1000);
    await h.ask('ana@porteros.pro');
    h.clock.advance(2 * 60 * 1000);
    expect(await h.check('ana@porteros.pro', h.codes.mailer.lastCode())).toEqual({ outcome: 'code_expired' });
  });
});

describe('VerifyAdminEmailCodeCommandHandler: edge cases (admin spec 009)', () => {
  it('refuses an active member with no linked account', async () => {
    const h = adminHarness();
    await h.roles.ensureOwner(h.clock.now());
    const now = h.clock.now();
    await h.members.add(
      StaffMember.rehydrate({
        id: 'staff-9',
        email: 'raro@porteros.pro',
        displayName: null,
        userId: null,
        roleIds: ['owner'],
        status: 'active',
        invitedBy: 'x',
        invitedAt: now,
        inviteExpiresAt: null,
        createdAt: now,
        lastSignInAt: null,
        updatedAt: now,
      }),
    );
    await h.ask('raro@porteros.pro');

    expect(await h.check('raro@porteros.pro', h.codes.mailer.lastCode())).toEqual({ outcome: 'invalid_code' });
  });

  it('uses the account another sign-in created at the same time', async () => {
    const h = adminHarness();
    await h.roles.ensureOwner(h.clock.now());
    await h.members.add(StaffMember.invite({ id: 'staff-2', email: 'luis@porteros.pro', roleId: 'owner', invitedBy: 'x' }, h.clock.now()));
    await h.ask('luis@porteros.pro');
    const other = User.createFromVerifiedEmail({ id: 'first', email: 'luis@porteros.pro' });
    const find = h.users.findByEmailKey.bind(h.users);
    let calls = 0;
    h.users.findByEmailKey = async (key) => (++calls === 1 ? (await h.users.add(other), null) : find(key));

    expect((await h.check('luis@porteros.pro', h.codes.mailer.lastCode())).outcome).toBe('signed_in');
    expect(await h.members.getById('staff-2')).toMatchObject({ userId: 'first' });
  });

  it('lets any other failure to create the account through', async () => {
    const h = adminHarness();
    await h.roles.ensureOwner(h.clock.now());
    await h.members.add(StaffMember.invite({ id: 'staff-2', email: 'luis@porteros.pro', roleId: 'owner', invitedBy: 'x' }, h.clock.now()));
    await h.ask('luis@porteros.pro');
    h.users.add = async () => {
      throw new Error('database down');
    };

    await expect(h.check('luis@porteros.pro', h.codes.mailer.lastCode())).rejects.toThrow('database down');
  });
});

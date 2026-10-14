import { describe, expect, it } from 'vitest';
import { RequestEmailCodeCommand } from '../../../../../src/application/features/auth/commands/requestEmailCode/requestEmailCodeCommand.js';
import { RequestEmailCodeCommandHandler } from '../../../../../src/application/features/auth/commands/requestEmailCode/requestEmailCodeCommandHandler.js';
import { VerifyEmailCodeCommand } from '../../../../../src/application/features/auth/commands/verifyEmailCode/verifyEmailCodeCommand.js';
import { VerifyEmailCodeCommandHandler } from '../../../../../src/application/features/auth/commands/verifyEmailCode/verifyEmailCodeCommandHandler.js';
import { requestLoginCode } from '../../../../../src/application/features/auth/common/requestLoginCode.js';
import { EmailKeyTakenError } from '../../../../../src/application/features/auth/common/ports.js';
import type { GoalkeeperProfile } from '../../../../../src/domain/goalkeepers/goalkeeperProfile.js';
import { ExternalIdentity } from '../../../../../src/domain/users/externalIdentity.js';
import { User } from '../../../../../src/domain/users/user.js';
import { FakeInternalTokenIssuer } from '../../../../fakes/fakeInternalTokenIssuer.js';
import { FakeRefreshTokenRepository } from '../../../../fakes/fakeRefreshTokenRepository.js';
import { FakeUserBlockRepository } from '../../../../fakes/fakeUserBlockRepository.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { LOGIN_CODE_NOW, loginCodeHarness } from './loginCodeHarness.js';

const MINUTE = 60 * 1000;

function appHarness() {
  const h = loginCodeHarness();
  const users = new FakeUserRepository();
  const refreshTokens = new FakeRefreshTokenRepository();
  const tokenIssuer = new FakeInternalTokenIssuer();
  const blocks = new FakeUserBlockRepository();
  const goalkeepers = new Set<string>();
  let userIds = 0;
  const handler = new VerifyEmailCodeCommandHandler({
    ...h.deps,
    users,
    session: {
      refreshTokenRepository: refreshTokens,
      tokenIssuer,
      goalkeeperProfileRepository: { getByUserId: async (userId) => (goalkeepers.has(userId) ? ({} as GoalkeeperProfile) : null) },
      idGenerator: { newId: () => `token-${++userIds}` },
      refreshTokenLifetimeMs: 30 * 24 * 60 * MINUTE,
      blockedUsers: blocks,
    },
    userIds: { newId: () => `user-${++userIds}` },
  });
  const request = new RequestEmailCodeCommandHandler(h.deps);
  const ask = (email = 'Juana@Gmail.com') => request.handle(new RequestEmailCodeCommand(email, '1.2.3.4'));
  const verify = (code: string, email = 'juana@gmail.com', ip = '1.2.3.4') => handler.handle(new VerifyEmailCodeCommand(email, code, ip));
  return { ...h, users, refreshTokens, tokenIssuer, blocks, goalkeepers, ask, verify };
}

describe('VerifyEmailCodeCommandHandler (admin spec 009, US1)', () => {
  it('creates the account of a new address and signs it in like Google does', async () => {
    const h = appHarness();
    await h.ask();

    const result = await h.verify(h.mailer.lastCode());

    expect(result.outcome).toBe('success');
    const user = await h.users.findByEmailKey('juana@gmail.com');
    expect(user).toMatchObject({ email: 'juana@gmail.com', isProfileComplete: false, externalIdentities: [] });
    expect(result).toEqual({ outcome: 'success', tokens: { accessToken: 'access-1', refreshToken: 'refresh-1', expiresInSeconds: 900 } });
    expect(await h.refreshTokens.findActiveByHash('hash:refresh-1')).toMatchObject({ userId: user!.id });
  });

  it('signs in to the account Google created for that address, with its goalkeeper claim', async () => {
    const h = appHarness();
    const existing = User.createFromExternalIdentity({ id: 'google-user', email: 'juana@gmail.com', displayName: null, provider: 'google', subject: 'sub-1', emailVerified: true });
    h.users.seed(existing);
    h.goalkeepers.add('google-user');
    await h.ask();

    expect((await h.verify(h.mailer.lastCode())).outcome).toBe('success');
    expect(await h.tokenIssuer.verifyAccessToken('access-1')).toMatchObject({ sub: 'google-user', isGoalkeeper: 'true' });
    expect((await h.users.getAll()).length).toBe(1);
  });

  it('uses the account a simultaneous first sign-in just created', async () => {
    const h = appHarness();
    await h.ask();
    const other = User.createFromVerifiedEmail({ id: 'first', email: 'juana@gmail.com' });
    const originalFind = h.users.findByEmailKey.bind(h.users);
    let calls = 0;
    // The first look finds nothing; the other sign-in creates the account before this one adds its own.
    h.users.findByEmailKey = async (key) => (++calls === 1 ? (await h.users.add(other), null) : originalFind(key));

    expect((await h.verify(h.mailer.lastCode())).outcome).toBe('success');
    expect(await h.tokenIssuer.verifyAccessToken('access-1')).toMatchObject({ sub: 'first' });
    expect((await h.users.getAll()).map((user) => user.id)).toEqual(['first']);
  });

  it('refuses a blocked account only after the right code, and uses the code up', async () => {
    const h = appHarness();
    h.users.seed(User.createFromVerifiedEmail({ id: 'blocked-user', email: 'juana@gmail.com' }));
    await h.blocks.block('blocked-user', 'staff-1', 'fraude', LOGIN_CODE_NOW);
    await h.ask();
    const code = h.mailer.lastCode();

    expect(await h.verify('999999')).toEqual({ outcome: 'invalid_code' });
    expect(await h.verify(code)).toEqual({ outcome: 'account_blocked' });
    expect(await h.verify(code)).toEqual({ outcome: 'invalid_code' });
    expect(await h.refreshTokens.getAll()).toEqual([]);
  });

  it('refuses a wrong code and counts it, then too_many_attempts at the third in a row', async () => {
    const h = appHarness();
    await h.ask();
    const code = h.mailer.lastCode();

    for (let attempt = 1; attempt <= 2; attempt += 1) expect(await h.verify('999999')).toEqual({ outcome: 'invalid_code' });
    expect(h.codes.peek('app', 'juana@gmail.com')!.failedAttempts).toBe(2);
    expect(await h.verify('999999')).toEqual({ outcome: 'too_many_attempts' });
    expect(await h.verify(code)).toEqual({ outcome: 'too_many_attempts' });
  });

  it('refuses an expired code', async () => {
    const h = appHarness();
    await h.ask();
    h.clock.advance(2 * MINUTE);

    expect(await h.verify(h.mailer.lastCode())).toEqual({ outcome: 'code_expired' });
  });

  it('refuses a code issued for the admin web', async () => {
    const h = appHarness();
    await requestLoginCode(h.deps, { audience: 'admin', email: 'juana@gmail.com', ip: '1.2.3.4', deliver: async () => true });

    expect(await h.verify(h.mailer.lastCode())).toEqual({ outcome: 'invalid_code' });
  });

  it('reads a code with spaces or dashes, and refuses anything else without counting it', async () => {
    const h = appHarness();
    await h.ask();
    const code = h.mailer.lastCode();

    expect(await h.verify('12345')).toEqual({ outcome: 'invalid_code' });
    expect(await h.verify('abc123')).toEqual({ outcome: 'invalid_code' });
    expect(h.codes.peek('app', 'juana@gmail.com')!.failedAttempts).toBe(0);
    expect((await h.verify(` ${code.slice(0, 3)}-${code.slice(3)} `)).outcome).toBe('success');
  });

  it('refuses an address that is not an email as a wrong code', async () => {
    const h = appHarness();

    expect(await h.verify('123456', 'juana@')).toEqual({ outcome: 'invalid_code' });
  });

  it('limits the checks per network address', async () => {
    const h = appHarness();
    await h.ask();
    for (let check = 0; check < 60; check += 1) await h.verify('12345', `persona${check}@gmail.com`, '9.9.9.9');

    expect(await h.verify(h.mailer.lastCode(), 'juana@gmail.com', '9.9.9.9')).toEqual({ outcome: 'too_many_requests', retryAfterSeconds: 3600 });
    expect(h.limiter.calls.at(-1)).toEqual({ key: 'email-code:verify:9.9.9.9', limit: 60, windowSeconds: 3600 });
  });

  it('logs each check with the address masked and never the code', async () => {
    const h = appHarness();
    await h.ask();
    const code = h.mailer.lastCode();

    await h.verify('999999');
    await h.verify(code);

    expect(h.logs.filter((entry) => entry.event === 'verify')).toEqual([
      { event: 'verify', audience: 'app', outcome: 'invalid_code', emailMasked: 'j***@gmail.com' },
      { event: 'verify', audience: 'app', outcome: 'signed_in', emailMasked: 'j***@gmail.com' },
    ]);
    expect(JSON.stringify(h.logs)).not.toContain(code);
  });

  it('lets an identity linked later find the same account', async () => {
    const h = appHarness();
    await h.ask();
    await h.verify(h.mailer.lastCode());
    const user = (await h.users.findByEmailKey('juana@gmail.com'))!;
    user.linkExternalIdentity(new ExternalIdentity('google', 'sub-9', 'juana@gmail.com'));

    expect((await h.users.findByExternalIdentity('google', 'sub-9'))?.id).toBe(user.id);
  });
});

describe('VerifyEmailCodeCommandHandler: account failures (admin spec 009)', () => {
  it('lets a failure to create the account through', async () => {
    const h = appHarness();
    await h.ask();
    h.users.add = async () => {
      throw new Error('database down');
    };

    await expect(h.verify(h.mailer.lastCode())).rejects.toThrow('database down');
  });

  it('lets the race through when the other account cannot be read either', async () => {
    const h = appHarness();
    await h.ask();
    h.users.findByEmailKey = async () => null;
    h.users.add = async (user) => {
      throw new EmailKeyTakenError(user.emailKey!);
    };

    await expect(h.verify(h.mailer.lastCode())).rejects.toBeInstanceOf(EmailKeyTakenError);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { ExchangeSsoCredentialCommand } from '../../../../../src/application/features/auth/commands/exchangeSsoCredential/exchangeSsoCredentialCommand.js';
import { ExchangeSsoCredentialCommandHandler } from '../../../../../src/application/features/auth/commands/exchangeSsoCredential/exchangeSsoCredentialCommandHandler.js';
import { ExternalIdentity } from '../../../../../src/domain/users/externalIdentity.js';
import { User } from '../../../../../src/domain/users/user.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeGoogleIdTokenValidator } from '../../../../fakes/fakeGoogleIdTokenValidator.js';
import { FakeInternalTokenIssuer } from '../../../../fakes/fakeInternalTokenIssuer.js';
import { FakeRefreshTokenRepository } from '../../../../fakes/fakeRefreshTokenRepository.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';

describe('ExchangeSsoCredentialCommandHandler: one account per proven email (admin spec 009, Q1)', () => {
  let users: FakeUserRepository;
  let google: FakeGoogleIdTokenValidator;
  let tokens: FakeInternalTokenIssuer;
  let handler: ExchangeSsoCredentialCommandHandler;

  beforeEach(() => {
    users = new FakeUserRepository();
    google = new FakeGoogleIdTokenValidator();
    tokens = new FakeInternalTokenIssuer();
    let ids = 0;
    handler = new ExchangeSsoCredentialCommandHandler(
      google,
      users,
      new FakeRefreshTokenRepository(),
      tokens,
      new FakeGoalkeeperProfileRepository(),
      { newId: () => `id-${++ids}` },
      { logSsoAttempt: () => undefined },
    );
  });

  const signIn = () => handler.handle(new ExchangeSsoCredentialCommand('google', 'mobile', 'good-token'));

  it('links a new Google identity with a verified email to the account a code made for it', async () => {
    users.seed(User.createFromVerifiedEmail({ id: 'code-user', email: 'juana@gmail.com' }));
    google.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-1', 'Juana@Gmail.com'), true);

    expect((await signIn()).outcome).toBe('success');

    const all = await users.getAll();
    expect(all.map((user) => user.id)).toEqual(['code-user']);
    expect(all[0]!.findExternalIdentity('google', 'sub-1')).toMatchObject({ email: 'Juana@Gmail.com' });
    expect(await tokens.verifyAccessToken('access-1')).toMatchObject({ sub: 'code-user' });
  });

  it('gives a new account the email key of its verified address', async () => {
    google.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-1', 'Juana@Gmail.com'), true);

    await signIn();

    expect((await users.findByEmailKey('juana@gmail.com'))?.findExternalIdentity('google', 'sub-1')).toBeDefined();
  });

  it('does not link through an address Google did not verify, and creates a separate account as before', async () => {
    users.seed(User.createFromVerifiedEmail({ id: 'code-user', email: 'juana@gmail.com' }));
    google.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-1', 'juana@gmail.com'), false);

    await signIn();

    const all = await users.getAll();
    expect(all).toHaveLength(2);
    expect(all.find((user) => user.id !== 'code-user')).toMatchObject({ emailKey: null });
  });

  it('leaves alone a known identity', async () => {
    const known = User.createFromExternalIdentity({ id: 'google-user', email: 'juana@gmail.com', displayName: null, provider: 'google', subject: 'sub-1' });
    users.seed(known);
    users.seed(User.createFromVerifiedEmail({ id: 'code-user', email: 'juana@gmail.com' }));
    google.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-1', 'juana@gmail.com'), true);

    await signIn();

    expect(await tokens.verifyAccessToken('access-1')).toMatchObject({ sub: 'google-user' });
    expect((await users.getById('code-user'))!.externalIdentities).toEqual([]);
  });
});

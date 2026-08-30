import { beforeEach, describe, expect, it } from 'vitest';
import { ExchangeSsoCredentialCommand } from '../../../../../src/application/features/auth/commands/exchangeSsoCredential/exchangeSsoCredentialCommand.js';
import { ExchangeSsoCredentialCommandHandler } from '../../../../../src/application/features/auth/commands/exchangeSsoCredential/exchangeSsoCredentialCommandHandler.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { FakeRefreshTokenRepository } from '../../../../fakes/fakeRefreshTokenRepository.js';
import { FakeGoogleIdTokenValidator } from '../../../../fakes/fakeGoogleIdTokenValidator.js';
import { FakeInternalTokenIssuer } from '../../../../fakes/fakeInternalTokenIssuer.js';
import { ExternalIdentity } from '../../../../../src/domain/users/externalIdentity.js';
import { User } from '../../../../../src/domain/users/user.js';

describe('ExchangeSsoCredentialCommandHandler', () => {
  let userRepository: FakeUserRepository;
  let refreshTokenRepository: FakeRefreshTokenRepository;
  let googleValidator: FakeGoogleIdTokenValidator;
  let tokenIssuer: FakeInternalTokenIssuer;
  let idCounter: number;
  let handler: ExchangeSsoCredentialCommandHandler;

  beforeEach(() => {
    userRepository = new FakeUserRepository();
    refreshTokenRepository = new FakeRefreshTokenRepository();
    googleValidator = new FakeGoogleIdTokenValidator();
    tokenIssuer = new FakeInternalTokenIssuer();
    idCounter = 0;
    handler = new ExchangeSsoCredentialCommandHandler(
      googleValidator,
      userRepository,
      refreshTokenRepository,
      tokenIssuer,
      { newId: () => `id-${++idCounter}` },
      { logSsoAttempt: () => undefined },
    );
  });

  it('auto-provisions a new account for a first-time mobile sign-in', async () => {
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-1', 'new@example.com'));

    const result = await handler.handle(new ExchangeSsoCredentialCommand('google', 'mobile', 'good-token'));

    expect(result.outcome).toBe('success');
    const users = await userRepository.getAll();
    expect(users).toHaveLength(1);
    expect(users[0]?.isAdmin).toBe(false);
  });

  it('resolves a returning identity to the same account rather than creating a duplicate', async () => {
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-1', 'user@example.com'));
    await handler.handle(new ExchangeSsoCredentialCommand('google', 'mobile', 'good-token'));

    await handler.handle(new ExchangeSsoCredentialCommand('google', 'mobile', 'good-token'));

    const users = await userRepository.getAll();
    expect(users).toHaveLength(1);
  });

  it('rejects an invalid credential and issues no session', async () => {
    const result = await handler.handle(new ExchangeSsoCredentialCommand('google', 'mobile', 'bad-token'));

    expect(result.outcome).toBe('invalid_credential');
    expect(await userRepository.getAll()).toHaveLength(0);
  });

  it('rejects an admin-web login with no matching account, creating nothing', async () => {
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-1', 'nobody@example.com'));

    const result = await handler.handle(new ExchangeSsoCredentialCommand('google', 'admin-web', 'good-token'));

    expect(result.outcome).toBe('unauthorized_admin_account');
    expect(await userRepository.getAll()).toHaveLength(0);
  });

  it('rejects admin-web with an identical outcome when the account exists but is not an admin', async () => {
    const nonAdmin = User.createFromExternalIdentity({
      id: 'existing-user',
      email: 'client@example.com',
      displayName: null,
      provider: 'google',
      subject: 'sub-2',
    });
    userRepository.seed(nonAdmin);
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-2', 'client@example.com'));

    const result = await handler.handle(new ExchangeSsoCredentialCommand('google', 'admin-web', 'good-token'));

    expect(result.outcome).toBe('unauthorized_admin_account');
  });

  it('issues a session for an existing admin-web account', async () => {
    const admin = User.createFromExternalIdentity({
      id: 'admin-user',
      email: 'admin@example.com',
      displayName: null,
      provider: 'google',
      subject: 'admin-sub',
      isAdmin: true,
    });
    userRepository.seed(admin);
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'admin-sub', 'admin@example.com'));

    const result = await handler.handle(new ExchangeSsoCredentialCommand('google', 'admin-web', 'good-token'));

    expect(result.outcome).toBe('success');
  });
});

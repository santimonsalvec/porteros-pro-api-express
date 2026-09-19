import { beforeEach, describe, expect, it } from 'vitest';
import { ExchangeSsoCredentialCommand } from '../../../../../src/application/features/auth/commands/exchangeSsoCredential/exchangeSsoCredentialCommand.js';
import { ExchangeSsoCredentialCommandHandler } from '../../../../../src/application/features/auth/commands/exchangeSsoCredential/exchangeSsoCredentialCommandHandler.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { FakeRefreshTokenRepository } from '../../../../fakes/fakeRefreshTokenRepository.js';
import { FakeGoogleIdTokenValidator } from '../../../../fakes/fakeGoogleIdTokenValidator.js';
import { FakeInternalTokenIssuer } from '../../../../fakes/fakeInternalTokenIssuer.js';
import { ExternalIdentity } from '../../../../../src/domain/users/externalIdentity.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { GoalkeeperProfile } from '../../../../../src/domain/goalkeepers/goalkeeperProfile.js';
import { User } from '../../../../../src/domain/users/user.js';

function makeGoalkeeperProfile(userId: string): GoalkeeperProfile {
  return new GoalkeeperProfile({
    id: `gp-${userId}`,
    userId,
    documentType: 'CC',
    documentNumber: '123',
    issueDate: new Date('2020-01-01'),
    birthDate: new Date('1995-01-01'),
    documentPhotoAId: 'img-a',
    documentPhotoBId: 'img-b',
    heightCm: 180,
    weightKg: 75,
    cityId: 'city-1',
    zoneIds: ['zone-1'],
    activatedAt: new Date('2026-01-01'),
  });
}

describe('ExchangeSsoCredentialCommandHandler', () => {
  let userRepository: FakeUserRepository;
  let refreshTokenRepository: FakeRefreshTokenRepository;
  let googleValidator: FakeGoogleIdTokenValidator;
  let tokenIssuer: FakeInternalTokenIssuer;
  let goalkeeperProfileRepository: FakeGoalkeeperProfileRepository;
  let idCounter: number;
  let handler: ExchangeSsoCredentialCommandHandler;

  beforeEach(() => {
    userRepository = new FakeUserRepository();
    refreshTokenRepository = new FakeRefreshTokenRepository();
    googleValidator = new FakeGoogleIdTokenValidator();
    tokenIssuer = new FakeInternalTokenIssuer();
    goalkeeperProfileRepository = new FakeGoalkeeperProfileRepository();
    idCounter = 0;
    handler = new ExchangeSsoCredentialCommandHandler(
      googleValidator,
      userRepository,
      refreshTokenRepository,
      tokenIssuer,
      goalkeeperProfileRepository,
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

  it('omits the isGoalkeeper claim for a client without a goalkeeper profile', async () => {
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-1', 'new@example.com'));

    const result = await handler.handle(new ExchangeSsoCredentialCommand('google', 'mobile', 'good-token'));

    expect(result.outcome).toBe('success');
    const claims = await tokenIssuer.verifyAccessToken(result.tokens!.accessToken);
    expect(claims).not.toHaveProperty('isGoalkeeper');
  });

  it('adds isGoalkeeper: "true" for a client with an active goalkeeper profile', async () => {
    const client = User.createFromExternalIdentity({
      id: 'goalkeeper-user',
      email: 'gk@example.com',
      displayName: null,
      provider: 'google',
      subject: 'sub-gk',
    });
    userRepository.seed(client);
    await goalkeeperProfileRepository.add(makeGoalkeeperProfile(client.id));
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-gk', 'gk@example.com'));

    const result = await handler.handle(new ExchangeSsoCredentialCommand('google', 'mobile', 'good-token'));

    expect(result.outcome).toBe('success');
    const claims = await tokenIssuer.verifyAccessToken(result.tokens!.accessToken);
    expect(claims?.isGoalkeeper).toBe('true');
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

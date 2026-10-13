import { beforeEach, describe, expect, it } from 'vitest';
import { ExchangeSsoCredentialCommand } from '../../../../../src/application/features/auth/commands/exchangeSsoCredential/exchangeSsoCredentialCommand.js';
import { ExchangeSsoCredentialCommandHandler } from '../../../../../src/application/features/auth/commands/exchangeSsoCredential/exchangeSsoCredentialCommandHandler.js';
import { RefreshAccessTokenCommand } from '../../../../../src/application/features/auth/commands/refreshAccessToken/refreshAccessTokenCommand.js';
import { RefreshAccessTokenCommandHandler } from '../../../../../src/application/features/auth/commands/refreshAccessToken/refreshAccessTokenCommandHandler.js';
import { ExternalIdentity } from '../../../../../src/domain/users/externalIdentity.js';
import { RefreshToken } from '../../../../../src/domain/users/refreshToken.js';
import { User } from '../../../../../src/domain/users/user.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { FakeRefreshTokenRepository } from '../../../../fakes/fakeRefreshTokenRepository.js';
import { FakeGoogleIdTokenValidator } from '../../../../fakes/fakeGoogleIdTokenValidator.js';
import { FakeInternalTokenIssuer } from '../../../../fakes/fakeInternalTokenIssuer.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeUserBlockRepository } from '../../../../fakes/fakeUserBlockRepository.js';

const AT = new Date('2026-10-12T15:00:00.000Z');

describe('a blocked user and the app sign-in (admin spec 005, FR-027, FR-030)', () => {
  let users: FakeUserRepository;
  let refreshTokens: FakeRefreshTokenRepository;
  let google: FakeGoogleIdTokenValidator;
  let issuer: FakeInternalTokenIssuer;
  let blocks: FakeUserBlockRepository;
  let exchange: ExchangeSsoCredentialCommandHandler;
  let refresh: RefreshAccessTokenCommandHandler;

  beforeEach(async () => {
    users = new FakeUserRepository();
    refreshTokens = new FakeRefreshTokenRepository();
    google = new FakeGoogleIdTokenValidator();
    issuer = new FakeInternalTokenIssuer();
    blocks = new FakeUserBlockRepository();
    const profiles = new FakeGoalkeeperProfileRepository();
    let id = 0;
    exchange = new ExchangeSsoCredentialCommandHandler(google, users, refreshTokens, issuer, profiles, { newId: () => `id-${++id}` }, { logSsoAttempt: () => undefined }, undefined, blocks);
    refresh = new RefreshAccessTokenCommandHandler(refreshTokens, users, issuer, profiles, { newId: () => `rt-${++id}` }, undefined, blocks);
    await users.add(User.createFromExternalIdentity({ id: 'u1', email: 'u1@x.co', displayName: null, provider: 'google', subject: 'sub-1' }));
    google.registerValidCredential('cred', new ExternalIdentity('google', 'sub-1', 'u1@x.co'));
    await refreshTokens.add(RefreshToken.create('rt-0', 'u1', issuer.hashRefreshToken('raw'), 60_000));
  });

  it('refuses the sign-in of a blocked user, issuing nothing', async () => {
    await blocks.block('u1', 'staff', 'Acoso', AT);

    expect(await exchange.handle(new ExchangeSsoCredentialCommand('google', 'mobile', 'cred'))).toEqual({ outcome: 'account_blocked' });
    expect((await refreshTokens.getAll()).map((token) => token.id)).toEqual(['rt-0']);
  });

  it('refuses the renewal of a blocked user without spending the refresh token', async () => {
    await blocks.block('u1', 'staff', 'Acoso', AT);

    expect(await refresh.handle(new RefreshAccessTokenCommand('raw'))).toEqual({ outcome: 'account_blocked' });
    expect((await refreshTokens.getById('rt-0'))!.isUsed).toBe(false);
  });

  it('lets an unblocked user in again', async () => {
    await blocks.block('u1', 'staff', 'Acoso', AT);
    await blocks.unblock('u1', 'staff', 'Revisado', AT);

    expect((await exchange.handle(new ExchangeSsoCredentialCommand('google', 'mobile', 'cred'))).outcome).toBe('success');
    expect((await refresh.handle(new RefreshAccessTokenCommand('raw'))).outcome).toBe('success');
  });
});

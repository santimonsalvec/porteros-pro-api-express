import { beforeEach, describe, expect, it } from 'vitest';
import { RefreshAccessTokenCommand } from '../../../../../src/application/features/auth/commands/refreshAccessToken/refreshAccessTokenCommand.js';
import { RefreshAccessTokenCommandHandler } from '../../../../../src/application/features/auth/commands/refreshAccessToken/refreshAccessTokenCommandHandler.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { FakeRefreshTokenRepository } from '../../../../fakes/fakeRefreshTokenRepository.js';
import { FakeInternalTokenIssuer } from '../../../../fakes/fakeInternalTokenIssuer.js';
import { User } from '../../../../../src/domain/users/user.js';
import { RefreshToken } from '../../../../../src/domain/users/refreshToken.js';

describe('RefreshAccessTokenCommandHandler', () => {
  let userRepository: FakeUserRepository;
  let refreshTokenRepository: FakeRefreshTokenRepository;
  let tokenIssuer: FakeInternalTokenIssuer;
  let handler: RefreshAccessTokenCommandHandler;
  let user: User;

  beforeEach(async () => {
    userRepository = new FakeUserRepository();
    refreshTokenRepository = new FakeRefreshTokenRepository();
    tokenIssuer = new FakeInternalTokenIssuer();
    handler = new RefreshAccessTokenCommandHandler(refreshTokenRepository, userRepository, tokenIssuer, {
      newId: () => 'new-refresh-token-id',
    });

    user = User.createFromExternalIdentity({
      id: 'user-1',
      email: 'user@example.com',
      displayName: null,
      provider: 'google',
      subject: 'sub-1',
    });
    await userRepository.add(user);
  });

  it('rotates to a new access+refresh pair for a valid, unexpired, unused token', async () => {
    const active = RefreshToken.create('rt-1', user.id, tokenIssuer.hashRefreshToken('raw-token'), 1000 * 60);
    await refreshTokenRepository.add(active);

    const result = await handler.handle(new RefreshAccessTokenCommand('raw-token'));

    expect(result.outcome).toBe('success');
    const stored = await refreshTokenRepository.getById('rt-1');
    expect(stored?.isUsed).toBe(true);
  });

  it('rejects an already-used refresh token', async () => {
    const used = RefreshToken.create('rt-1', user.id, tokenIssuer.hashRefreshToken('raw-token'), 1000 * 60);
    used.markUsed();
    await refreshTokenRepository.add(used);

    const result = await handler.handle(new RefreshAccessTokenCommand('raw-token'));

    expect(result.outcome).toBe('invalid_refresh_token');
  });

  it('rejects an expired refresh token', async () => {
    const expired = RefreshToken.create('rt-1', user.id, tokenIssuer.hashRefreshToken('raw-token'), -1000);
    await refreshTokenRepository.add(expired);

    const result = await handler.handle(new RefreshAccessTokenCommand('raw-token'));

    expect(result.outcome).toBe('invalid_refresh_token');
  });

  it('rejects an unrecognized refresh token', async () => {
    const result = await handler.handle(new RefreshAccessTokenCommand('never-issued'));

    expect(result.outcome).toBe('invalid_refresh_token');
  });
});

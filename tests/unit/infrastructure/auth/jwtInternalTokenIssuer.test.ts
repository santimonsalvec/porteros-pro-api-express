import { decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import { JwtInternalTokenIssuer } from '../../../../src/infrastructure/auth/jwtInternalTokenIssuer.js';
import { User } from '../../../../src/domain/users/user.js';

const issuer = new JwtInternalTokenIssuer({
  signingKey: () => 'test-signing-key-test-signing-key-1234',
  accessTokenLifetimeMinutes: 15,
  refreshTokenLifetimeDays: 30,
});

const user = User.createFromExternalIdentity({
  id: 'user-1',
  email: 'user@example.com',
  displayName: null,
  provider: 'google',
  subject: 'sub-1',
});

describe('JwtInternalTokenIssuer isGoalkeeper claim', () => {
  it('does not put the claim in the token by default', async () => {
    const { accessToken } = await issuer.issue(user);

    expect(decodeJwt(accessToken)).not.toHaveProperty('isGoalkeeper');
    expect(await issuer.verifyAccessToken(accessToken)).not.toHaveProperty('isGoalkeeper');
  });

  it('does not put the claim in the token when isGoalkeeper is false', async () => {
    const { accessToken } = await issuer.issue(user, { isGoalkeeper: false });

    expect(decodeJwt(accessToken)).not.toHaveProperty('isGoalkeeper');
  });

  it('puts isGoalkeeper: "true" in the token and reads it back on verification', async () => {
    const { accessToken } = await issuer.issue(user, { isGoalkeeper: true });

    expect(decodeJwt(accessToken).isGoalkeeper).toBe('true');
    expect((await issuer.verifyAccessToken(accessToken))?.isGoalkeeper).toBe('true');
  });
});

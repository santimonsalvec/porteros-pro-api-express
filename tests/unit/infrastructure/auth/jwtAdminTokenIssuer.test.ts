import { decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import { JwtAdminTokenIssuer } from '../../../../src/infrastructure/auth/jwtAdminTokenIssuer.js';
import { JwtInternalTokenIssuer } from '../../../../src/infrastructure/auth/jwtInternalTokenIssuer.js';
import { User } from '../../../../src/domain/users/user.js';

const signingKey = () => 'test-signing-key-test-signing-key-1234';
const adminIssuer = new JwtAdminTokenIssuer({ signingKey, accessTokenLifetimeSeconds: 300 });
const mobileIssuer = new JwtInternalTokenIssuer({ signingKey, accessTokenLifetimeMinutes: 15, refreshTokenLifetimeDays: 30 });
const claims = { userId: 'user-1', sessionId: 'sid-1', staffId: 'staff-1' };

describe('JwtAdminTokenIssuer', () => {
  it("issues a 5-minute token for the admin audience with the session and staff ids", async () => {
    const { accessToken, expiresInSeconds } = await adminIssuer.issueAccessToken(claims);
    const payload = decodeJwt(accessToken);

    expect(expiresInSeconds).toBe(300);
    expect(payload).toMatchObject({ iss: 'porterospro-api', aud: 'porterospro-admin', sub: 'user-1', sid: 'sid-1', stf: 'staff-1' });
    expect(payload).not.toHaveProperty('isAdmin');
    expect(payload.exp! - payload.iat!).toBe(300);
    expect(await adminIssuer.verifyAccessToken(accessToken)).toEqual(claims);
  });

  it("refuses the app's tokens, and the app refuses the admin's", async () => {
    const user = User.createFromExternalIdentity({ id: 'user-1', email: 'a@example.com', displayName: null, provider: 'google', subject: 'sub-1' });
    const mobile = await mobileIssuer.issue(user);
    const admin = await adminIssuer.issueAccessToken(claims);

    expect(await adminIssuer.verifyAccessToken(mobile.accessToken)).toBeNull();
    expect(await mobileIssuer.verifyAccessToken(admin.accessToken)).toBeNull();
    expect(await adminIssuer.verifyAccessToken('not-a-jwt')).toBeNull();
  });

  it('makes 32-byte opaque refresh values and hashes them with SHA-256', () => {
    const raw = adminIssuer.newRefreshToken();

    expect(Buffer.from(raw, 'base64url')).toHaveLength(32);
    expect(adminIssuer.newRefreshToken()).not.toBe(raw);
    expect(adminIssuer.hashRefreshToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

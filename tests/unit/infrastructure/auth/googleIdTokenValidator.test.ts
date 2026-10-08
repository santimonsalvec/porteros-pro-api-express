import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyIdToken = vi.fn();
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

const { GoogleIdTokenValidator } = await import('../../../../src/infrastructure/auth/googleIdTokenValidator.js');

const ticket = (payload: Record<string, unknown> | undefined) => ({ getPayload: () => payload });

describe('GoogleIdTokenValidator.validateForAdmin', () => {
  beforeEach(() => verifyIdToken.mockReset());

  it("verifies against the admin-web client and keeps email_verified and the name", async () => {
    verifyIdToken.mockResolvedValue(ticket({ sub: 'sub-1', email: 'ana@example.com', email_verified: true, name: 'Ana' }));
    const validator = new GoogleIdTokenValidator({ mobile: ['ios-client'], 'admin-web': ['web-client'] });

    const result = await validator.validateForAdmin('id-token');

    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'id-token', audience: ['web-client'] });
    expect(result).toMatchObject({ emailVerified: true, displayName: 'Ana', identity: { provider: 'google', subject: 'sub-1', email: 'ana@example.com' } });
  });

  it('reports an unverified email as such and a missing name as null', async () => {
    verifyIdToken.mockResolvedValue(ticket({ sub: 'sub-1', email: 'ana@example.com', email_verified: false }));
    const validator = new GoogleIdTokenValidator({ 'admin-web': ['web-client'] });

    expect(await validator.validateForAdmin('id-token')).toMatchObject({ emailVerified: false, displayName: null });
  });

  it('is null without a configured admin-web client, without sub or email, or when Google rejects the token', async () => {
    expect(await new GoogleIdTokenValidator({ mobile: ['ios-client'] }).validateForAdmin('id-token')).toBeNull();
    expect(verifyIdToken).not.toHaveBeenCalled();

    const validator = new GoogleIdTokenValidator({ 'admin-web': ['web-client'] });
    verifyIdToken.mockResolvedValueOnce(ticket({ sub: 'sub-1' }));
    expect(await validator.validateForAdmin('id-token')).toBeNull();
    verifyIdToken.mockRejectedValueOnce(new Error('Wrong recipient'));
    expect(await validator.validateForAdmin('id-token')).toBeNull();
  });
});

describe('GoogleIdTokenValidator.validate (app)', () => {
  beforeEach(() => verifyIdToken.mockReset());

  it("verifies against the platform's clients", async () => {
    verifyIdToken.mockResolvedValue(ticket({ sub: 'sub-1', email: 'ana@example.com' }));
    const validator = new GoogleIdTokenValidator({ mobile: ['ios-client', undefined, 'android-web'] });

    const identity = await validator.validate('id-token', 'mobile');

    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'id-token', audience: ['ios-client', 'android-web'] });
    expect(identity).toMatchObject({ provider: 'google', subject: 'sub-1', email: 'ana@example.com' });
  });

  it('is null for an unknown platform, a payload without email, or a rejected token', async () => {
    const validator = new GoogleIdTokenValidator({ mobile: ['ios-client'] });
    expect(await validator.validate('id-token', 'desktop')).toBeNull();

    verifyIdToken.mockResolvedValueOnce(ticket({ sub: 'sub-1' }));
    expect(await validator.validate('id-token', 'mobile')).toBeNull();
    verifyIdToken.mockRejectedValueOnce(new Error('expired'));
    expect(await validator.validate('id-token', 'mobile')).toBeNull();
  });
});


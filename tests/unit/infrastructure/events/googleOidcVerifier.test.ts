import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyIdToken = vi.fn();
vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(function OAuth2Client() {
    return { verifyIdToken };
  }),
}));

const { GoogleOidcVerifier } = await import('../../../../src/infrastructure/events/googleOidcVerifier.js');

const AUDIENCE = 'https://api.porteros.pro';
const PUSH = 'events-push@porteros.iam.gserviceaccount.com';
const ticket = (payload: Record<string, unknown>) => ({ getPayload: () => payload });
const verifier = () => new GoogleOidcVerifier(AUDIENCE, [PUSH]);

beforeEach(() => {
  verifyIdToken.mockReset();
});

describe('GoogleOidcVerifier — US5: only the platform may call /internal', () => {
  it('accepts a token for our audience from an allowed, verified identity', async () => {
    verifyIdToken.mockResolvedValue(ticket({ email: PUSH, email_verified: true }));

    expect(await verifier().verify('token')).toEqual({ ok: true, email: PUSH });
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'token', audience: AUDIENCE });
  });

  it('refuses a token the library rejects (signature, expiry, audience)', async () => {
    verifyIdToken.mockImplementation(() => Promise.reject(new Error('Wrong recipient')));

    expect(await verifier().verify('token')).toEqual({ ok: false, reason: 'invalid_token' });
  });

  it('refuses an unverified email', async () => {
    verifyIdToken.mockResolvedValue(ticket({ email: PUSH, email_verified: false }));

    expect(await verifier().verify('token')).toEqual({ ok: false, reason: 'unverified_email' });
  });

  it('refuses an identity that is not an allowed invoker', async () => {
    verifyIdToken.mockResolvedValue(ticket({ email: 'someone@gmail.com', email_verified: true }));

    expect(await verifier().verify('token')).toEqual({ ok: false, reason: 'invoker_not_allowed' });
  });

  it('refuses an empty token and an unconfigured audience without calling Google', async () => {
    expect(await verifier().verify('')).toEqual({ ok: false, reason: 'missing_token' });
    expect(await new GoogleOidcVerifier('', [PUSH]).verify('token')).toEqual({ ok: false, reason: 'not_configured' });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});

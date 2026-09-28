import { OAuth2Client } from 'google-auth-library';

export type InternalCallerVerdict = { ok: true; email: string } | { ok: false; reason: string };

/**
 * Verifies the Google OIDC token Pub/Sub push and Cloud Scheduler attach to their calls
 * (research §10): signature and expiry, the pinned audience, a verified email, and that email in
 * the allowed invokers. Never throws; any failure is a refusal with a reason (never the token).
 */
export class GoogleOidcVerifier {
  private readonly client = new OAuth2Client();

  constructor(
    private readonly audience: string,
    private readonly allowedInvokers: readonly string[],
  ) {}

  async verify(token: string): Promise<InternalCallerVerdict> {
    if (!this.audience) return { ok: false, reason: 'not_configured' };
    if (!token) return { ok: false, reason: 'missing_token' };
    try {
      const ticket = await this.client.verifyIdToken({ idToken: token, audience: this.audience });
      const payload = ticket.getPayload();
      if (!payload?.email || payload.email_verified !== true) return { ok: false, reason: 'unverified_email' };
      if (!this.allowedInvokers.includes(payload.email)) return { ok: false, reason: 'invoker_not_allowed' };
      return { ok: true, email: payload.email };
    } catch {
      return { ok: false, reason: 'invalid_token' };
    }
  }
}

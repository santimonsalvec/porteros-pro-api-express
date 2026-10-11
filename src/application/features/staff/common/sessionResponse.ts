import type { AdminSession } from '../../../../domain/staff/adminSession.js';

/** The session limits the admin web shows; never the refresh value. */
export interface AdminSessionSummary {
  startedAt: Date;
  absoluteExpiresAt: Date;
}

export function toSessionSummary(session: AdminSession): AdminSessionSummary {
  return { startedAt: session.startedAt, absoluteExpiresAt: session.absoluteExpiresAt };
}

/** A successful sign-in or refresh: the refresh value goes to the cookie, never the response body. */
export interface IssuedAdminSession {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken: string;
  session: AdminSessionSummary;
}

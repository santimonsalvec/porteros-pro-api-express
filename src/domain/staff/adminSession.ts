import { Entity } from '../common/entity.js';

/** A session ends 12 hours after the Google sign-in, however much it is used (spec 001, FR-013). */
export const ADMIN_SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
/** …and earlier after 30 minutes without a refresh. */
export const ADMIN_SESSION_IDLE_MS = 30 * 60 * 1000;

const USER_AGENT_MAX = 300;

export type AdminSessionRevokedReason = 'sign_out' | 'staff_disabled' | 'refresh_reuse';

export interface AdminSessionProps {
  id: string;
  staffId: string;
  userId: string;
  refreshTokenHash: string;
  previousRefreshTokenHash: string | null;
  startedAt: Date;
  absoluteExpiresAt: Date;
  idleExpiresAt: Date;
  revokedAt: Date | null;
  revokedReason: AdminSessionRevokedReason | null;
  userAgent: string;
  ip: string;
}

/**
 * One admin sign-in in one browser. Its id is the access token's `sid`, so revoking it ends every
 * tab of that browser at once. Only the hash of the current (and previous) refresh value is kept:
 * the previous one coming back means it was copied, and the session is revoked.
 */
export class AdminSession extends Entity<string> {
  readonly staffId: string;
  readonly userId: string;
  readonly refreshTokenHash: string;
  readonly previousRefreshTokenHash: string | null;
  readonly startedAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly idleExpiresAt: Date;
  readonly revokedAt: Date | null;
  readonly revokedReason: AdminSessionRevokedReason | null;
  readonly userAgent: string;
  readonly ip: string;

  private constructor(props: AdminSessionProps) {
    super(props.id);
    this.staffId = props.staffId;
    this.userId = props.userId;
    this.refreshTokenHash = props.refreshTokenHash;
    this.previousRefreshTokenHash = props.previousRefreshTokenHash;
    this.startedAt = new Date(props.startedAt);
    this.absoluteExpiresAt = new Date(props.absoluteExpiresAt);
    this.idleExpiresAt = new Date(props.idleExpiresAt);
    this.revokedAt = props.revokedAt ? new Date(props.revokedAt) : null;
    this.revokedReason = props.revokedReason;
    this.userAgent = props.userAgent.slice(0, USER_AGENT_MAX);
    this.ip = props.ip;
  }

  static start(
    params: { id: string; staffId: string; userId: string; refreshTokenHash: string; userAgent: string; ip: string },
    now: Date,
  ): AdminSession {
    const absoluteExpiresAt = new Date(now.getTime() + ADMIN_SESSION_ABSOLUTE_MS);
    return new AdminSession({
      ...params,
      previousRefreshTokenHash: null,
      startedAt: now,
      absoluteExpiresAt,
      idleExpiresAt: idleLimit(now, absoluteExpiresAt),
      revokedAt: null,
      revokedReason: null,
    });
  }

  static rehydrate(props: AdminSessionProps): AdminSession {
    return new AdminSession(props);
  }

  isValid(now: Date): boolean {
    return this.revokedAt === null && now < this.absoluteExpiresAt && now < this.idleExpiresAt;
  }

  rotate(newRefreshTokenHash: string, now: Date): AdminSession {
    return new AdminSession({
      ...this,
      refreshTokenHash: newRefreshTokenHash,
      previousRefreshTokenHash: this.refreshTokenHash,
      idleExpiresAt: idleLimit(now, this.absoluteExpiresAt),
    });
  }

  revoke(reason: AdminSessionRevokedReason, now: Date): AdminSession {
    return new AdminSession({ ...this, revokedAt: now, revokedReason: reason });
  }
}

function idleLimit(now: Date, absoluteExpiresAt: Date): Date {
  return new Date(Math.min(now.getTime() + ADMIN_SESSION_IDLE_MS, absoluteExpiresAt.getTime()));
}

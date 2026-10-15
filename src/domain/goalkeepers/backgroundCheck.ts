import { normalizeVettingReason } from './vetting.js';

export type BackgroundCheckStatus = 'pending' | 'approved' | 'rejected';

/** At most this many pending or approved, unexpired background checks per goalkeeper (research §3). */
export const BACKGROUND_CHECK_LIMIT = 5;
/** An approved background check this close to its expiry is flagged in the admin (FR-004b). */
export const EXPIRING_SOON_DAYS = 30;

const DAY_MS = 86_400_000;

/** One year after the approval, the default validity of a background check (FR-004a). */
export function defaultBackgroundCheckExpiry(approvedAt: Date): Date {
  const expiry = new Date(approvedAt);
  expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
  return expiry;
}

export class BackgroundCheckReviewedError extends Error {
  constructor(id: string) {
    super(`Background check ${id} was already reviewed`);
    this.name = 'BackgroundCheckReviewedError';
  }
}

export interface BackgroundCheckProps {
  id: string;
  goalkeeperId: string;
  imageId: string;
  uploadedAt: Date;
  status: BackgroundCheckStatus;
  reviewedAt: Date | null;
  /** The staff member (user id) who reviewed it. */
  reviewedBy: string | null;
  rejectionReason: string | null;
  expiresAt: Date | null;
  revision: number;
}

/**
 * A criminal background certificate a goalkeeper uploaded (admin spec 030). Reviewed once; when
 * approved it is valid until `expiresAt`. Expiry is read, never written: the goalkeeper stays
 * validated until the team decides (clarification 2).
 */
export class BackgroundCheck {
  readonly id: string;
  readonly goalkeeperId: string;
  readonly imageId: string;
  readonly uploadedAt: Date;
  readonly status: BackgroundCheckStatus;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly rejectionReason: string | null;
  readonly expiresAt: Date | null;
  readonly revision: number;

  private constructor(props: BackgroundCheckProps) {
    this.id = props.id;
    this.goalkeeperId = props.goalkeeperId;
    this.imageId = props.imageId;
    this.uploadedAt = new Date(props.uploadedAt);
    this.status = props.status;
    this.reviewedAt = props.reviewedAt ? new Date(props.reviewedAt) : null;
    this.reviewedBy = props.reviewedBy;
    this.rejectionReason = props.rejectionReason;
    this.expiresAt = props.expiresAt ? new Date(props.expiresAt) : null;
    this.revision = props.revision;
  }

  static upload(id: string, goalkeeperId: string, imageId: string, at: Date): BackgroundCheck {
    return new BackgroundCheck({
      id,
      goalkeeperId,
      imageId,
      uploadedAt: at,
      status: 'pending',
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
      expiresAt: null,
      revision: 0,
    });
  }

  static rehydrate(props: BackgroundCheckProps): BackgroundCheck {
    return new BackgroundCheck(props);
  }

  /** Valid until `expiresAt` (one year by default), which must be after the approval. */
  approve(by: string, at: Date, expiresAt?: Date): BackgroundCheck {
    this.assertPending();
    const until = expiresAt ?? defaultBackgroundCheckExpiry(at);
    if (until.getTime() <= at.getTime()) throw new Error('Background check expiry must be in the future');
    return new BackgroundCheck({ ...this, status: 'approved', reviewedAt: at, reviewedBy: by, expiresAt: until, revision: this.revision + 1 });
  }

  reject(by: string, at: Date, reason: string): BackgroundCheck {
    this.assertPending();
    return new BackgroundCheck({
      ...this,
      status: 'rejected',
      reviewedAt: at,
      reviewedBy: by,
      rejectionReason: normalizeVettingReason(reason),
      revision: this.revision + 1,
    });
  }

  isExpiredAt(now: Date): boolean {
    return this.status === 'approved' && this.expiresAt !== null && this.expiresAt.getTime() <= now.getTime();
  }

  /** Approved, not expired yet, and expiring within 30 days. */
  isExpiringSoonAt(now: Date): boolean {
    if (this.status !== 'approved' || !this.expiresAt || this.isExpiredAt(now)) return false;
    return this.expiresAt.getTime() - now.getTime() <= EXPIRING_SOON_DAYS * DAY_MS;
  }

  /** Counts toward the limit: waiting for review, or approved and still valid. */
  isActiveAt(now: Date): boolean {
    return this.status === 'pending' || (this.status === 'approved' && !this.isExpiredAt(now));
  }

  private assertPending(): void {
    if (this.status !== 'pending') throw new BackgroundCheckReviewedError(this.id);
  }
}

export type ValidationGap = 'identification_photos' | 'approved_background_check' | 'pending_background_checks';

/**
 * Whether the team can validate the goalkeeper now (FR-004): both identification photos, at least
 * one approved background check still valid, and none waiting for review.
 */
export function canApproveValidation(
  identification: { documentPhotoAId: string | null; documentPhotoBId: string | null },
  checks: readonly BackgroundCheck[],
  now: Date,
): { ok: boolean; missing: ValidationGap[] } {
  const missing: ValidationGap[] = [];
  if (!identification.documentPhotoAId || !identification.documentPhotoBId) missing.push('identification_photos');
  if (!checks.some((check) => check.status === 'approved' && !check.isExpiredAt(now))) missing.push('approved_background_check');
  if (checks.some((check) => check.status === 'pending')) missing.push('pending_background_checks');
  return { ok: missing.length === 0, missing };
}

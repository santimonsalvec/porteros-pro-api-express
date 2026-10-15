import type { BackgroundCheck, ValidationGap } from '../../../../domain/goalkeepers/backgroundCheck.js';
import type { VerificationMethod, VettingTier } from '../../../../domain/goalkeepers/vetting.js';

/** A background check as its goalkeeper sees it (contracts A2): never who reviewed it. */
export interface MyBackgroundCheckView {
  id: string;
  url: string | null;
  uploadedAt: string;
  status: BackgroundCheck['status'];
  rejectionReason: string | null;
  expiresAt: string | null;
  expired: boolean;
}

export function toMyBackgroundCheck(check: BackgroundCheck, url: string | null, now: Date): MyBackgroundCheckView {
  return {
    id: check.id,
    url,
    uploadedAt: check.uploadedAt.toISOString(),
    status: check.status,
    rejectionReason: check.rejectionReason,
    expiresAt: check.expiresAt?.toISOString() ?? null,
    expired: check.isExpiredAt(now),
  };
}

/** A staff member as the admin shows them, or the system (reputation). */
export type ActorView = { kind: 'staff'; userId: string; name: string } | { kind: 'system' };

export interface AdminBackgroundCheckView extends MyBackgroundCheckView {
  reviewedAt: string | null;
  reviewedBy: { userId: string; name: string } | null;
  expiringSoon: boolean;
  revision: number;
}

export type VerificationDetailsView =
  | { referrer: { userId: string; name: string | null; active: boolean } }
  | { platformName: string; evidence: Array<{ imageId: string; url: string | null }> }
  | { evaluatedOn: string; notes: string | null }
  | { ratingCount: number; ratingAverage: number };

export interface VettingHistoryView {
  id: string;
  at: string;
  actor: ActorView;
  action: string;
  method: string | null;
  reason: string | null;
  details: Record<string, unknown>;
}

/** The "Validación" tab of the goalkeeper (contracts C2). */
export interface GoalkeeperVettingView {
  revision: number;
  tier: VettingTier;
  validatedAt: string | null;
  validatedBy: { userId: string; name: string } | null;
  lastRejection: { reason: string; at: string; by: { userId: string; name: string } } | null;
  verification: { method: VerificationMethod; at: string; by: ActorView; details: VerificationDetailsView } | null;
  autoVerificationBlocked: boolean;
  identification: { photos: { front: string | null; back: string | null } };
  backgroundChecks: AdminBackgroundCheckView[];
  reputation: { ratingCount: number; ratingAverage: number | null };
  canApproveValidation: { ok: boolean; missing: ValidationGap[] };
  history: VettingHistoryView[];
}

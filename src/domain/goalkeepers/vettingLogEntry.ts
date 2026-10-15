import type { VerificationMethod, VettingActor } from './vetting.js';

export const VETTING_LOG_ACTIONS = [
  'background_check.approved',
  'background_check.rejected',
  'validation.approved',
  'validation.rejected',
  'validation.revoked',
  'verification.granted',
  'verification.revoked',
  'practice.failed',
] as const;
export type VettingLogAction = (typeof VETTING_LOG_ACTIONS)[number];

/**
 * One decision about a goalkeeper's validation or verification (admin spec 030, research §4),
 * append-only. It holds the system's decisions too (reputation), which the admin audit log does not.
 */
export interface VettingLogEntry {
  id: string;
  goalkeeperId: string;
  at: Date;
  actor: VettingActor;
  action: VettingLogAction;
  method: VerificationMethod | null;
  reason: string | null;
  details: Record<string, unknown>;
}

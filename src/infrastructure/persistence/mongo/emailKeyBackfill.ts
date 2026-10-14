import { normalizeEmail } from '../../../domain/common/email.js';

/** What `scripts/backfill-user-email-key.ts` reads of each account. */
export interface BackfillUser {
  id: string;
  email: string;
  createdAt: Date;
  emailKey: string | null;
  hasExternalIdentity: boolean;
}

export interface EmailKeyBackfillPlan {
  updates: { id: string; emailKey: string }[];
  /** Emails more than one account has: only `keptId` gets (or keeps) the key; review the rest by hand. */
  duplicates: { emailKey: string; keptId: string; skippedIds: string[] }[];
  /** Google accounts whose stored email is not an address. */
  invalidIds: string[];
}

/**
 * The email key of the accounts made before admin spec 009 (research §4). Their email came in a
 * Google token, so it counts as proven. Where several accounts share an address, the oldest one
 * gets the key — unless one of them already has it — and the group is reported.
 */
export function planEmailKeyBackfill(users: readonly BackfillUser[]): EmailKeyBackfillPlan {
  const groups = new Map<string, BackfillUser[]>();
  const invalidIds: string[] = [];
  for (const user of users) {
    if (!user.hasExternalIdentity && !user.emailKey) continue;
    const key = user.emailKey ?? normalizeEmail(user.email);
    if (!key) {
      invalidIds.push(user.id);
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), user]);
  }

  const plan: EmailKeyBackfillPlan = { updates: [], duplicates: [], invalidIds };
  for (const [emailKey, group] of groups) {
    const byAge = [...group].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    const kept = byAge.find((user) => user.emailKey === emailKey) ?? byAge[0]!;
    if (kept.emailKey !== emailKey) plan.updates.push({ id: kept.id, emailKey });
    if (group.length > 1) plan.duplicates.push({ emailKey, keptId: kept.id, skippedIds: byAge.filter((user) => user !== kept).map((user) => user.id) });
  }
  return plan;
}

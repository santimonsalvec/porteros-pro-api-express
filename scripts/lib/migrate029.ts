/**
 * The pure part of migration 029 (wallet → operating balance, top-up → deposit): which collections
 * are renamed and how each stored document is rewritten, plus the check that no amount changed.
 * It is the only place besides `migrate-029-operating-balance.ts` that may name the old terms.
 *
 * Every rewrite is idempotent (a document already rewritten comes back equal) and never touches an
 * amount, a sequence or a balance.
 */
import type { Document } from 'mongodb';

export const COLLECTION_RENAMES: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'wallets', to: 'operatingBalances' },
  { from: 'walletMovements', to: 'balanceMovements' },
  { from: 'topUps', to: 'deposits' },
];

/** Locks keyed by a job name that changed; they only hold a lease, so the old one is dropped. */
export const OBSOLETE_JOB_LOCKS: readonly string[] = ['top-up-reconcile'];

const NOTIFICATION_TYPES: Readonly<Record<string, string>> = {
  'wallet.top_up_approved': 'operating_balance.deposit_approved',
  'wallet.top_up_failed': 'operating_balance.deposit_failed',
  'wallet.adjusted': 'operating_balance.adjusted',
};

const PERMISSIONS: Readonly<Record<string, string>> = {
  'wallets.read': 'operating_balances.read',
  'wallets.adjust': 'operating_balances.adjust',
  'topups.read': 'deposits.read',
  'topups.reconcile': 'deposits.reconcile',
};

const AUDIT_ACTIONS: Readonly<Record<string, string>> = {
  'wallet.adjust': 'operating_balance.adjust',
  'topUp.reconcile': 'deposit.reconcile',
  'topUps.export': 'deposits.export',
};

const RESOURCE_TYPES: Readonly<Record<string, string>> = {
  wallet: 'operatingBalance',
  topUp: 'deposit',
  topUps: 'deposits',
};

const OLD_TERM = /wallet|top[-_]?ups?/i;

function mapped(table: Readonly<Record<string, string>>, value: unknown): unknown {
  return typeof value === 'string' && value in table ? table[value] : value;
}

/** A `walletMovements` document as a `balanceMovements` one. */
export function rewriteMovement(doc: Document): Document {
  const { walletId, references, ...rest } = doc;
  const out: Document = { ...rest };
  if (walletId !== undefined) out.operatingBalanceId = walletId;
  else if (doc.operatingBalanceId !== undefined) out.operatingBalanceId = doc.operatingBalanceId;
  if (out.type === 'top_up') out.type = 'deposit';
  if (typeof out.causeKey === 'string' && out.causeKey.startsWith('top_up:')) {
    out.causeKey = `deposit:${out.causeKey.slice('top_up:'.length)}`;
  }
  if (references && typeof references === 'object') {
    const { topUpId, ...others } = references as Document;
    out.references = topUpId === undefined ? { ...others } : { ...others, depositId: topUpId };
  }
  return out;
}

/** A notice of the inbox, its type and the deposit it points to. */
export function rewriteNotification(doc: Document): Document {
  const out: Document = { ...doc, type: mapped(NOTIFICATION_TYPES, doc.type) };
  if (doc.data && typeof doc.data === 'object') {
    const { topUpId, ...others } = doc.data as Document;
    const data: Document = { ...others };
    if (topUpId !== undefined) data.depositId = topUpId;
    if (data.type !== undefined) data.type = mapped(NOTIFICATION_TYPES, data.type);
    out.data = data;
  }
  return out;
}

/** A staff role with its permission ids renamed. */
export function rewriteStaffRole(doc: Document): Document {
  const permissions = (doc.permissions as string[] | undefined) ?? [];
  return { ...doc, permissions: permissions.map((id) => mapped(PERMISSIONS, id) as string) };
}

/** An admin audit entry with its action id and resource type renamed. */
export function rewriteAuditEntry(doc: Document): Document {
  const out: Document = { ...doc, action: mapped(AUDIT_ACTIONS, doc.action) };
  if (doc.resourceType !== undefined) out.resourceType = mapped(RESOURCE_TYPES, doc.resourceType);
  return out;
}

/** Whether a document (at any depth) still carries one of the old terms; for the final report. */
export function mentionsOldTerm(value: unknown): boolean {
  if (typeof value === 'string') return OLD_TERM.test(value);
  if (Array.isArray(value)) return value.some(mentionsOldTerm);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, inner]) => OLD_TERM.test(key) || mentionsOldTerm(inner));
  }
  return false;
}

export interface Totals {
  balanceCount: number;
  movementCount: number;
  movementSum: number;
  perBalance: Record<string, { balance: number; movements: number }>;
}

/** Counts and sums, from rows read before or after the rename (the owner field may be either name). */
export function totalsOf(
  balances: ReadonlyArray<{ _id: unknown; balance: number }>,
  movements: ReadonlyArray<{ walletId?: unknown; operatingBalanceId?: unknown; amount: number }>,
): Totals {
  const perBalance: Totals['perBalance'] = {};
  for (const balance of balances) perBalance[String(balance._id)] = { balance: balance.balance, movements: 0 };
  let movementSum = 0;
  for (const movement of movements) {
    const owner = String(movement.operatingBalanceId ?? movement.walletId);
    movementSum += movement.amount;
    (perBalance[owner] ??= { balance: 0, movements: 0 }).movements += movement.amount;
  }
  return { balanceCount: balances.length, movementCount: movements.length, movementSum, perBalance };
}

/** What differs between the totals before and after, and every balance that isn't its movements' sum. */
export function verifyTotals(before: Totals, after: Totals): string[] {
  const problems: string[] = [];
  for (const key of ['balanceCount', 'movementCount', 'movementSum'] as const) {
    if (before[key] !== after[key]) problems.push(`${key}: ${before[key]} → ${after[key]}`);
  }
  for (const [label, totals] of [['before', before], ['after', after]] as const) {
    for (const [owner, { balance, movements }] of Object.entries(totals.perBalance)) {
      if (balance !== movements) problems.push(`${label}: balance of ${owner} is ${balance} but its movements add up to ${movements}`);
    }
  }
  for (const [owner, entry] of Object.entries(before.perBalance)) {
    const later = after.perBalance[owner];
    if (!later || later.balance !== entry.balance) problems.push(`balance of ${owner}: ${entry.balance} → ${later?.balance ?? 'missing'}`);
  }
  return problems;
}

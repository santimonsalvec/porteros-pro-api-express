import type { ClientSession, Db, Document } from 'mongodb';
import type { ApplyOutcomeArgs, ApplyOutcomeResult, ITopUpStore } from '../../../application/features/payments/common/ports.js';
import type { MovementDraft } from '../../../application/features/wallet/common/ports.js';
import { canTransition, type TopUp } from '../../../domain/payments/topUp.js';
import { assertMovementShape } from '../../../domain/wallet/walletMovement.js';
import { TOP_UPS_COLLECTION, topUpFromDocument } from './topUpRepository.js';
import { appendMovementInSession } from './walletStore.js';

const SYSTEM = { kind: 'system' as const, userId: null };

/** The two movements of an approved top-up (research.md §5), with cause keys that make a repeat impossible. */
export function topUpMovementDrafts(topUp: TopUp, args: ApplyOutcomeArgs, ids: [string, string]): MovementDraft[] {
  const common = {
    goalkeeperId: args.owner.goalkeeperId,
    currency: args.owner.currency,
    occurredAt: args.now,
    actor: SYSTEM,
    references: { topUpId: topUp.id },
    cancellation: null,
    reason: null,
    invoicing: args.owner.invoicing,
  };
  const drafts: MovementDraft[] = [{ ...common, id: ids[0], type: 'top_up', amount: topUp.amount, causeKey: `top_up:${topUp.id}` }];
  if (topUp.cost > 0) {
    drafts.push({ ...common, id: ids[1], type: 'gateway_fee', amount: -topUp.cost, causeKey: `gateway_fee:${topUp.id}` });
  }
  return drafts;
}

/** Whether what the gateway charged is exactly this top-up. */
export function matchesCharge(topUp: TopUp, charged: ApplyOutcomeArgs['charged']): boolean {
  return charged === null || (charged.amountInCents === topUp.amount * 100 && charged.currency === topUp.currency);
}

/**
 * Applies a gateway outcome in one transaction (research.md §5): read the top-up, refuse a
 * mismatched charge or a disallowed transition, credit an approval (the gross `top_up`, then the
 * `gateway_fee`) through 011's ledger writes, and change the status conditionally on the one read.
 * A concurrent repeat conflicts on the top-up document; the driver retries it, and the retry sees
 * the final status and answers `unchanged` — so a payment is credited at most once.
 */
export class MongoTopUpStore implements ITopUpStore {
  constructor(
    private readonly startSession: () => ClientSession,
    private readonly db: Db,
    private readonly newId: () => string,
  ) {}

  async applyOutcome(args: ApplyOutcomeArgs): Promise<ApplyOutcomeResult> {
    const session = this.startSession();
    try {
      return await session.withTransaction(() => this.applyInSession(session, args), {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      });
    } finally {
      await session.endSession();
    }
  }

  private async applyInSession(session: ClientSession, args: ApplyOutcomeArgs): Promise<ApplyOutcomeResult> {
    const topUps = this.db.collection(TOP_UPS_COLLECTION);
    const doc = await topUps.findOne({ _id: args.topUpId } as Document, { session });
    if (!doc) return { kind: 'not_found' };
    const topUp = topUpFromDocument(doc);
    if (!matchesCharge(topUp, args.charged)) return { kind: 'mismatch', topUp };
    if (!canTransition(topUp.status, args.status)) return { kind: 'unchanged', topUp };

    let balance: number | null = null;
    if (args.status === 'approved') {
      for (const draft of topUpMovementDrafts(topUp, args, [this.newId(), this.newId()])) {
        assertMovementShape(draft);
        const appended = await appendMovementInSession(this.db, session, draft, args.now);
        // Neither movement is guarded, so this is unreachable short of a code change.
        if (appended.kind !== 'recorded') throw new Error(`Top-up ${topUp.id}: ${draft.type} was not recorded (${appended.kind})`);
        balance = appended.wallet.balance;
      }
    }

    const finalized = topUp.finalize(args.status, args.gatewayTransactionId, args.now);
    const updated = await topUps.updateOne(
      { _id: topUp.id, status: topUp.status } as Document,
      { $set: { status: finalized.status, gatewayTransactionId: finalized.gatewayTransactionId, finalizedAt: args.now, nextCheckAt: null } },
      { session },
    );
    if (updated.matchedCount !== 1) throw new Error(`Top-up ${topUp.id} changed while its outcome was applied`);
    return { kind: 'applied', topUp: finalized, balance };
  }
}

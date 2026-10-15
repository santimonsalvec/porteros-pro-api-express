import type { ClientSession, Db, Document } from 'mongodb';
import type { ApplyOutcomeArgs, ApplyOutcomeResult, IDepositStore } from '../../../application/features/payments/common/ports.js';
import type { MovementDraft } from '../../../application/features/operatingBalance/common/ports.js';
import { canTransition, type Deposit } from '../../../domain/deposits/deposit.js';
import { assertMovementShape } from '../../../domain/operatingBalance/balanceMovement.js';
import { DEPOSITS_COLLECTION, depositFromDocument } from './depositRepository.js';
import { appendMovementInSession } from './operatingBalanceStore.js';

const SYSTEM = { kind: 'system' as const, userId: null };

/** The two movements of an approved deposit (research.md §5), with cause keys that make a repeat impossible. */
export function depositMovementDrafts(deposit: Deposit, args: ApplyOutcomeArgs, ids: [string, string]): MovementDraft[] {
  const common = {
    goalkeeperId: args.owner.goalkeeperId,
    currency: args.owner.currency,
    occurredAt: args.now,
    actor: SYSTEM,
    references: { depositId: deposit.id },
    cancellation: null,
    reason: null,
    invoicing: args.owner.invoicing,
  };
  const drafts: MovementDraft[] = [{ ...common, id: ids[0], type: 'deposit', amount: deposit.amount, causeKey: `deposit:${deposit.id}` }];
  if (deposit.cost > 0) {
    drafts.push({ ...common, id: ids[1], type: 'gateway_fee', amount: -deposit.cost, causeKey: `gateway_fee:${deposit.id}` });
  }
  return drafts;
}

/** Whether what the gateway charged is exactly this deposit. */
export function matchesCharge(deposit: Deposit, charged: ApplyOutcomeArgs['charged']): boolean {
  return charged === null || (charged.amountInCents === deposit.amount * 100 && charged.currency === deposit.currency);
}

/**
 * Applies a gateway outcome in one transaction (research.md §5): read the deposit, refuse a
 * mismatched charge or a disallowed transition, credit an approval (the gross `deposit`, then the
 * `gateway_fee`) through 011's ledger writes, and change the status conditionally on the one read.
 * A concurrent repeat conflicts on the deposit document; the driver retries it, and the retry sees
 * the final status and answers `unchanged` — so a payment is credited at most once.
 */
export class MongoDepositStore implements IDepositStore {
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
    const deposits = this.db.collection(DEPOSITS_COLLECTION);
    const doc = await deposits.findOne({ _id: args.depositId } as Document, { session });
    if (!doc) return { kind: 'not_found' };
    const deposit = depositFromDocument(doc);
    if (!matchesCharge(deposit, args.charged)) return { kind: 'mismatch', deposit };
    if (!canTransition(deposit.status, args.status)) return { kind: 'unchanged', deposit };

    let balance: number | null = null;
    if (args.status === 'approved') {
      for (const draft of depositMovementDrafts(deposit, args, [this.newId(), this.newId()])) {
        assertMovementShape(draft);
        const appended = await appendMovementInSession(this.db, session, draft, args.now);
        // Neither movement is guarded, so this is unreachable short of a code change.
        if (appended.kind !== 'recorded') throw new Error(`Deposit ${deposit.id}: ${draft.type} was not recorded (${appended.kind})`);
        balance = appended.operatingBalance.balance;
      }
    }

    const finalized = deposit.finalize(args.status, args.gatewayTransactionId, args.now);
    const updated = await deposits.updateOne(
      { _id: deposit.id, status: deposit.status } as Document,
      { $set: { status: finalized.status, gatewayTransactionId: finalized.gatewayTransactionId, finalizedAt: args.now, nextCheckAt: null } },
      { session },
    );
    if (updated.matchedCount !== 1) throw new Error(`Deposit ${deposit.id} changed while its outcome was applied`);
    return { kind: 'applied', deposit: finalized, balance };
  }
}

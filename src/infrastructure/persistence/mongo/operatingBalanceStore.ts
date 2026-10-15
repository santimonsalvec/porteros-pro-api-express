import type { ClientSession, Db, Document } from 'mongodb';
import type { AppendResult, IOperatingBalanceStore, MovementDraft } from '../../../application/features/operatingBalance/common/ports.js';
import { isGuardedDebit, BalanceMovement } from '../../../domain/operatingBalance/balanceMovement.js';
import { BALANCE_MOVEMENTS_COLLECTION, movementFromDocument, movementToDocument } from './balanceMovementRepository.js';
import { OPERATING_BALANCES_COLLECTION, operatingBalanceFromDocument } from './operatingBalanceRepository.js';

const DUPLICATE_KEY = 11000;

function isDuplicateCause(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, keyPattern } = error as { code?: unknown; keyPattern?: unknown };
  return code === DUPLICATE_KEY && typeof keyPattern === 'object' && keyPattern !== null && 'causeKey' in keyPattern;
}

/**
 * The three writes of one movement (research.md §2), for use inside a caller's transaction:
 *   1. create the operating balance lazily;
 *   2. move the balance and the sequence in one conditional update — a guarded debit (every debit
 *      but a penalty) only matches when the balance covers it, so check and change are one
 *      server-side operation;
 *   3. insert the movement with its sequence and resulting balance.
 * Exported so a later feature's transaction (booking acceptance) can charge a commission atomically
 * with its own writes. Returns `insufficient_funds` (nothing written but the harmless upsert) or
 * the recorded movement; a duplicate cause surfaces as the driver's 11000 error.
 */
export async function appendMovementInSession(
  db: Db,
  session: ClientSession,
  draft: MovementDraft,
  now: Date,
): Promise<AppendResult> {
  const operatingBalances = db.collection(OPERATING_BALANCES_COLLECTION);
  const movements = db.collection(BALANCE_MOVEMENTS_COLLECTION);

  await operatingBalances.updateOne(
    { _id: draft.goalkeeperId } as Document,
    { $setOnInsert: { currency: draft.currency, balance: 0, lastSequence: 0, createdAt: now }, $set: { updatedAt: now } },
    { upsert: true, session },
  );

  const guard = isGuardedDebit(draft.type, draft.amount) ? { balance: { $gte: -draft.amount } } : {};
  const updated = await operatingBalances.findOneAndUpdate(
    { _id: draft.goalkeeperId, currency: draft.currency, ...guard } as Document,
    { $inc: { balance: draft.amount, lastSequence: 1 } },
    { returnDocument: 'after', session },
  );
  if (!updated) {
    const current = await operatingBalances.findOne({ _id: draft.goalkeeperId } as Document, { session });
    if (current && current.currency !== draft.currency) {
      // A operating balance has one currency; a movement in another one is a caller bug, not a lack of funds.
      throw new Error(`OperatingBalance ${draft.goalkeeperId} is in ${String(current.currency)}, not ${draft.currency}`);
    }
    return { kind: 'insufficient_funds', balance: (current?.balance as number | undefined) ?? 0 };
  }

  const operatingBalance = operatingBalanceFromDocument(updated);
  const { goalkeeperId, ...fields } = draft;
  const movement = BalanceMovement.rehydrate({
    ...fields,
    operatingBalanceId: goalkeeperId,
    sequence: operatingBalance.lastSequence,
    balanceAfter: operatingBalance.balance,
  });
  await movements.insertOne(movementToDocument(movement), { session });
  return { kind: 'recorded', movement, operatingBalance };
}

/**
 * Records one movement in its own transaction (FR-002, FR-007, FR-008). Two movements on the same
 * operating balance conflict on the operating balance document; the driver retries the loser, which then sees the new
 * balance — none is lost and the resulting balances follow one order. A duplicate cause aborts the
 * whole transaction (the balance is untouched) and returns the movement that already exists.
 */
export class MongoOperatingBalanceStore implements IOperatingBalanceStore {
  constructor(
    private readonly startSession: () => ClientSession,
    private readonly db: Db,
    private readonly now: () => Date,
  ) {}

  async append(draft: MovementDraft): Promise<AppendResult> {
    const session = this.startSession();
    try {
      return await session.withTransaction(
        () => appendMovementInSession(this.db, session, draft, this.now()),
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' },
      );
    } catch (error) {
      if (!isDuplicateCause(error)) throw error;
      const existing = await this.db.collection(BALANCE_MOVEMENTS_COLLECTION).findOne({ causeKey: draft.causeKey });
      if (!existing) throw error;
      return { kind: 'duplicate', movement: movementFromDocument(existing) };
    } finally {
      await session.endSession();
    }
  }
}

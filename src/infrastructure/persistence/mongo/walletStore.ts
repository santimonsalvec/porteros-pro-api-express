import type { ClientSession, Db, Document } from 'mongodb';
import type { AppendResult, IWalletStore, MovementDraft } from '../../../application/features/wallet/common/ports.js';
import { isGuardedDebit, WalletMovement } from '../../../domain/wallet/walletMovement.js';
import { WALLET_MOVEMENTS_COLLECTION, movementFromDocument, movementToDocument } from './walletMovementRepository.js';
import { WALLETS_COLLECTION, walletFromDocument } from './walletRepository.js';

const DUPLICATE_KEY = 11000;

function isDuplicateCause(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, keyPattern } = error as { code?: unknown; keyPattern?: unknown };
  return code === DUPLICATE_KEY && typeof keyPattern === 'object' && keyPattern !== null && 'causeKey' in keyPattern;
}

/**
 * The three writes of one movement (research.md §2), for use inside a caller's transaction:
 *   1. create the wallet lazily;
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
  const wallets = db.collection(WALLETS_COLLECTION);
  const movements = db.collection(WALLET_MOVEMENTS_COLLECTION);

  await wallets.updateOne(
    { _id: draft.goalkeeperId } as Document,
    { $setOnInsert: { currency: draft.currency, balance: 0, lastSequence: 0, createdAt: now }, $set: { updatedAt: now } },
    { upsert: true, session },
  );

  const guard = isGuardedDebit(draft.type, draft.amount) ? { balance: { $gte: -draft.amount } } : {};
  const updated = await wallets.findOneAndUpdate(
    { _id: draft.goalkeeperId, currency: draft.currency, ...guard } as Document,
    { $inc: { balance: draft.amount, lastSequence: 1 } },
    { returnDocument: 'after', session },
  );
  if (!updated) {
    const current = await wallets.findOne({ _id: draft.goalkeeperId } as Document, { session });
    if (current && current.currency !== draft.currency) {
      // A wallet has one currency; a movement in another one is a caller bug, not a lack of funds.
      throw new Error(`Wallet ${draft.goalkeeperId} is in ${String(current.currency)}, not ${draft.currency}`);
    }
    return { kind: 'insufficient_funds', balance: (current?.balance as number | undefined) ?? 0 };
  }

  const wallet = walletFromDocument(updated);
  const { goalkeeperId, ...fields } = draft;
  const movement = WalletMovement.rehydrate({
    ...fields,
    walletId: goalkeeperId,
    sequence: wallet.lastSequence,
    balanceAfter: wallet.balance,
  });
  await movements.insertOne(movementToDocument(movement), { session });
  return { kind: 'recorded', movement, wallet };
}

/**
 * Records one movement in its own transaction (FR-002, FR-007, FR-008). Two movements on the same
 * wallet conflict on the wallet document; the driver retries the loser, which then sees the new
 * balance — none is lost and the resulting balances follow one order. A duplicate cause aborts the
 * whole transaction (the balance is untouched) and returns the movement that already exists.
 */
export class MongoWalletStore implements IWalletStore {
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
      const existing = await this.db.collection(WALLET_MOVEMENTS_COLLECTION).findOne({ causeKey: draft.causeKey });
      if (!existing) throw error;
      return { kind: 'duplicate', movement: movementFromDocument(existing) };
    } finally {
      await session.endSession();
    }
  }
}

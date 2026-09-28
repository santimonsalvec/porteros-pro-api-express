import type { Collection, Db, Document } from 'mongodb';
import type { IWalletMovementRepository } from '../../../application/features/wallet/common/ports.js';
import {
  WalletMovement,
  type CancellationDetails,
  type InvoicingSnapshot,
  type MovementActor,
  type MovementReferences,
  type MovementType,
} from '../../../domain/wallet/walletMovement.js';

export const WALLET_MOVEMENTS_COLLECTION = 'walletMovements';

export function movementToDocument(movement: WalletMovement): Document {
  return {
    _id: movement.id,
    walletId: movement.walletId,
    sequence: movement.sequence,
    type: movement.type,
    amount: movement.amount,
    currency: movement.currency,
    balanceAfter: movement.balanceAfter,
    occurredAt: movement.occurredAt,
    causeKey: movement.causeKey,
    actor: movement.actor,
    references: movement.references,
    cancellation: movement.cancellation,
    reason: movement.reason,
    invoicing: movement.invoicing,
  };
}

export function movementFromDocument(doc: Document): WalletMovement {
  return WalletMovement.rehydrate({
    id: String(doc._id),
    walletId: doc.walletId as string,
    sequence: doc.sequence as number,
    type: doc.type as MovementType,
    amount: doc.amount as number,
    currency: doc.currency as string,
    balanceAfter: doc.balanceAfter as number,
    occurredAt: doc.occurredAt as Date,
    causeKey: doc.causeKey as string,
    actor: doc.actor as MovementActor,
    references: (doc.references as MovementReferences | undefined) ?? {},
    cancellation: (doc.cancellation as CancellationDetails | null | undefined) ?? null,
    reason: (doc.reason as string | null | undefined) ?? null,
    invoicing: doc.invoicing as InvoicingSnapshot,
  });
}

/**
 * The append-only record of wallet movements. Movements are written only by the wallet store's
 * transaction; this repository reads them and deliberately has no way to update or delete one.
 * `causeKey_unique` makes one cause yield at most one movement (FR-006); `wallet_sequence_unique`
 * serves the newest-first history and guards the per-wallet order (FR-007).
 */
export class WalletMovementRepository implements IWalletMovementRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(WALLET_MOVEMENTS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ causeKey: 1 }, { name: 'causeKey_unique', unique: true });
    await this.collection.createIndex({ walletId: 1, sequence: -1 }, { name: 'wallet_sequence_unique', unique: true });
  }

  async findByCauseKey(causeKey: string): Promise<WalletMovement | null> {
    const doc = await this.collection.findOne({ causeKey });
    return doc ? movementFromDocument(doc) : null;
  }

  async listForWallet(walletId: string, skip: number, limit: number): Promise<WalletMovement[]> {
    const docs = await this.collection.find({ walletId }).sort({ sequence: -1 }).skip(skip).limit(limit).toArray();
    return docs.map(movementFromDocument);
  }
}

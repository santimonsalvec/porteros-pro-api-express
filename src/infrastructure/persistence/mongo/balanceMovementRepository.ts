import type { Collection, Db, Document } from 'mongodb';
import type { IBalanceMovementRepository } from '../../../application/features/operatingBalance/common/ports.js';
import {
  BalanceMovement,
  type CancellationDetails,
  type InvoicingSnapshot,
  type MovementActor,
  type MovementReferences,
  type MovementType,
} from '../../../domain/operatingBalance/balanceMovement.js';

export const BALANCE_MOVEMENTS_COLLECTION = 'balanceMovements';

export function movementToDocument(movement: BalanceMovement): Document {
  return {
    _id: movement.id,
    operatingBalanceId: movement.operatingBalanceId,
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
    ...(movement.taxRateBps !== null ? { taxRateBps: movement.taxRateBps } : {}),
  };
}

export function movementFromDocument(doc: Document): BalanceMovement {
  return BalanceMovement.rehydrate({
    id: String(doc._id),
    operatingBalanceId: doc.operatingBalanceId as string,
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
    taxRateBps: (doc.taxRateBps as number | null | undefined) ?? null,
  });
}

/**
 * The append-only record of operating balance movements. Movements are written only by the operating balance store's
 * transaction; this repository reads them and deliberately has no way to update or delete one.
 * `causeKey_unique` makes one cause yield at most one movement (FR-006); `balance_sequence_unique`
 * serves the newest-first history and guards the per-operating balance order (FR-007).
 */
export class BalanceMovementRepository implements IBalanceMovementRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(BALANCE_MOVEMENTS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ causeKey: 1 }, { name: 'causeKey_unique', unique: true });
    await this.collection.createIndex({ operatingBalanceId: 1, sequence: -1 }, { name: 'balance_sequence_unique', unique: true });
    // The invoicing safety net's scan of billable movements (feature 023).
    await this.collection.createIndex({ type: 1, occurredAt: 1 }, { name: 'billable_occurred' });
  }

  async findById(id: string): Promise<BalanceMovement | null> {
    const doc = await this.collection.findOne({ _id: id } as Document);
    return doc ? movementFromDocument(doc) : null;
  }

  async findByCauseKey(causeKey: string): Promise<BalanceMovement | null> {
    const doc = await this.collection.findOne({ causeKey });
    return doc ? movementFromDocument(doc) : null;
  }

  async listForOperatingBalance(operatingBalanceId: string, skip: number, limit: number): Promise<BalanceMovement[]> {
    const docs = await this.collection.find({ operatingBalanceId }).sort({ sequence: -1 }).skip(skip).limit(limit).toArray();
    return docs.map(movementFromDocument);
  }
}

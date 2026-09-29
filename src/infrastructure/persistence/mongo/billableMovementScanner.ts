import type { Collection, Db, Document } from 'mongodb';
import type { BillableMovementRef, IBillableMovementScanner } from '../../../application/features/invoicing/common/ports.js';
import { BILLABLE_MOVEMENT_TYPES, type BillableMovementType } from '../../../domain/wallet/walletMovement.js';
import { INVOICING_DOCUMENTS_COLLECTION } from './invoicingDocumentRepository.js';
import { WALLET_MOVEMENTS_COLLECTION } from './walletMovementRepository.js';

const WINDOW_MS = 7 * 24 * 60 * 60_000;

/**
 * The invoicing safety net (research.md §2.4): billable movements whose document was never created
 * — for example because their event went to the dead-letter. Looks back 7 days (index
 * `billable_occurred`), then drops those already documented.
 */
export class BillableMovementScanner implements IBillableMovementScanner {
  private readonly movements: Collection<Document>;

  constructor(db: Db) {
    this.movements = db.collection(WALLET_MOVEMENTS_COLLECTION);
  }

  async findWithoutDocument(olderThan: Date, cap: number): Promise<BillableMovementRef[]> {
    const docs = await this.movements
      .aggregate([
        { $match: { type: { $in: [...BILLABLE_MOVEMENT_TYPES] }, occurredAt: { $lte: olderThan, $gte: new Date(olderThan.getTime() - WINDOW_MS) } } },
        { $sort: { occurredAt: 1 } },
        // `source_unique` makes this a point lookup per movement.
        { $lookup: { from: INVOICING_DOCUMENTS_COLLECTION, localField: '_id', foreignField: 'sourceMovementId', as: 'documents' } },
        { $match: { documents: { $size: 0 } } },
        { $limit: cap },
        { $project: { _id: 1, type: 1 } },
      ])
      .toArray();
    return docs.map((doc) => ({ movementId: String(doc._id), type: doc.type as BillableMovementType }));
  }
}

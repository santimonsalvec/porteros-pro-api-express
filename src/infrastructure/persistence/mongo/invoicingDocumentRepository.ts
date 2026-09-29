import type { Collection, Db, Document } from 'mongodb';
import type { IInvoicingDocumentRepository } from '../../../application/features/invoicing/common/ports.js';
import {
  InvoicingDocument,
  type InvoicingBuyer,
  type InvoicingConcept,
  type InvoicingDocumentKind,
  type InvoicingDocumentStatus,
  type InvoicingError,
  type ProviderBinding,
} from '../../../domain/invoicing/invoicingDocument.js';

export const INVOICING_DOCUMENTS_COLLECTION = 'invoicingDocuments';
const DUPLICATE_KEY = 11000;

const dateOrNull = (value: unknown): Date | null => (value ? new Date(value as Date) : null);

export function invoicingDocumentToDocument(document: InvoicingDocument): Document {
  const { id, ...fields } = document.toProps();
  return { _id: id, ...fields };
}

export function invoicingDocumentFromDocument(doc: Document): InvoicingDocument {
  const lastError = doc.lastError as (Omit<InvoicingError, 'at'> & { at: Date }) | null | undefined;
  return InvoicingDocument.rehydrate({
    id: String(doc._id),
    kind: doc.kind as InvoicingDocumentKind,
    concept: doc.concept as InvoicingConcept,
    goalkeeperId: doc.goalkeeperId as string,
    countryId: doc.countryId as string,
    sourceEventId: (doc.sourceEventId as string | null | undefined) ?? null,
    sourceMovementId: doc.sourceMovementId as string,
    vatMovementId: (doc.vatMovementId as string | null | undefined) ?? null,
    bookingId: (doc.bookingId as string | null | undefined) ?? null,
    requestId: (doc.requestId as string | null | undefined) ?? null,
    originalDocumentId: (doc.originalDocumentId as string | null | undefined) ?? null,
    base: doc.base as number,
    vat: doc.vat as number,
    total: doc.total as number,
    vatRateBps: doc.vatRateBps as number,
    currency: doc.currency as string,
    buyer: doc.buyer as InvoicingBuyer,
    status: doc.status as InvoicingDocumentStatus,
    waitingFor: (doc.waitingFor as string | null | undefined) ?? null,
    provider: (doc.provider as ProviderBinding | null | undefined) ?? null,
    attempts: (doc.attempts as number | undefined) ?? 0,
    nextAttemptAt: dateOrNull(doc.nextAttemptAt),
    lastError: lastError ? { ...lastError, at: new Date(lastError.at) } : null,
    occurredAt: new Date(doc.occurredAt as Date),
    createdAt: new Date(doc.createdAt as Date),
    issuedAt: dateOrNull(doc.issuedAt),
    updatedAt: new Date(doc.updatedAt as Date),
  });
}

function isDuplicateSource(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, keyPattern } = error as { code?: unknown; keyPattern?: unknown };
  return code === DUPLICATE_KEY && typeof keyPattern === 'object' && keyPattern !== null && 'sourceMovementId' in keyPattern;
}

/** Invoices and credit notes (feature 023): one per billable movement (`source_unique`). */
export class InvoicingDocumentRepository implements IInvoicingDocumentRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(INVOICING_DOCUMENTS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ sourceMovementId: 1 }, { name: 'source_unique', unique: true });
    await this.collection.createIndex({ goalkeeperId: 1, occurredAt: -1, _id: -1 }, { name: 'goalkeeper_occurred' });
    await this.collection.createIndex({ status: 1, nextAttemptAt: 1 }, { name: 'status_next' });
  }

  async createIfAbsent(document: InvoicingDocument): Promise<{ created: boolean; document: InvoicingDocument }> {
    try {
      await this.collection.insertOne(invoicingDocumentToDocument(document));
      return { created: true, document };
    } catch (error) {
      if (!isDuplicateSource(error)) throw error;
      const existing = await this.findBySourceMovementId(document.sourceMovementId);
      if (!existing) throw error;
      return { created: false, document: existing };
    }
  }

  async getById(id: string): Promise<InvoicingDocument | null> {
    const doc = await this.collection.findOne({ _id: id } as Document);
    return doc ? invoicingDocumentFromDocument(doc) : null;
  }

  async findBySourceMovementId(movementId: string): Promise<InvoicingDocument | null> {
    const doc = await this.collection.findOne({ sourceMovementId: movementId });
    return doc ? invoicingDocumentFromDocument(doc) : null;
  }

  async listForGoalkeeper(goalkeeperId: string, skip: number, limit: number): Promise<InvoicingDocument[]> {
    const docs = await this.collection.find({ goalkeeperId }).sort({ occurredAt: -1, _id: -1 }).skip(skip).limit(limit).toArray();
    return docs.map(invoicingDocumentFromDocument);
  }

  countForGoalkeeper(goalkeeperId: string): Promise<number> {
    return this.collection.countDocuments({ goalkeeperId });
  }

  async listByStatus(status: InvoicingDocumentStatus | null, skip: number, limit: number): Promise<InvoicingDocument[]> {
    const docs = await this.collection.find(status ? { status } : {}).sort({ createdAt: 1, _id: 1 }).skip(skip).limit(limit).toArray();
    return docs.map(invoicingDocumentFromDocument);
  }

  countByStatus(status: InvoicingDocumentStatus | null): Promise<number> {
    return this.collection.countDocuments(status ? { status } : {});
  }

  async findDue(now: Date, cap: number): Promise<InvoicingDocument[]> {
    const docs = await this.collection.find({ status: 'pending', nextAttemptAt: { $lte: now } }).sort({ nextAttemptAt: 1 }).limit(cap).toArray();
    return docs.map(invoicingDocumentFromDocument);
  }

  async findAwaiting(now: Date, cap: number): Promise<InvoicingDocument[]> {
    const docs = await this.collection
      .find({ status: 'awaiting_authority', nextAttemptAt: { $lte: now } })
      .sort({ nextAttemptAt: 1 })
      .limit(cap)
      .toArray();
    return docs.map(invoicingDocumentFromDocument);
  }

  countStale(before: Date): Promise<number> {
    return this.collection.countDocuments({ status: { $in: ['pending', 'awaiting_authority'] }, createdAt: { $lt: before } });
  }

  async update(document: InvoicingDocument, expectedStatus: InvoicingDocumentStatus): Promise<boolean> {
    const { _id, ...fields } = invoicingDocumentToDocument(document);
    const result = await this.collection.updateOne({ _id, status: expectedStatus } as Document, { $set: fields });
    return result.matchedCount === 1;
  }
}

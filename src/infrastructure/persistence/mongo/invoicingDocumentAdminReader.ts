import type { Collection, Db, Document } from 'mongodb';
import type { DocumentAdminFilter, IInvoicingDocumentAdminReader } from '../../../application/features/invoicing/common/adminPorts.js';
import type { InvoicingDocument } from '../../../domain/invoicing/invoicingDocument.js';
import { DOCUMENT_ADMIN_SORT, documentAdminFilter } from './invoicingDocumentAdminPipelines.js';
import { INVOICING_DOCUMENTS_COLLECTION, invoicingDocumentFromDocument } from './invoicingDocumentRepository.js';

/** The admin's reads of invoicing documents (admin spec 007, US2). */
export class InvoicingDocumentAdminReader implements IInvoicingDocumentAdminReader {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(INVOICING_DOCUMENTS_COLLECTION);
  }

  async list(filter: DocumentAdminFilter & { page: number; pageSize: number }, now: Date): Promise<{ items: InvoicingDocument[]; totalItems: number }> {
    const match = documentAdminFilter(filter, now);
    const [docs, totalItems] = await Promise.all([
      this.collection
        .find(match)
        .sort(DOCUMENT_ADMIN_SORT)
        .skip((filter.page - 1) * filter.pageSize)
        .limit(filter.pageSize)
        .toArray(),
      this.collection.countDocuments(match),
    ]);
    return { items: docs.map(invoicingDocumentFromDocument), totalItems };
  }

  count(filter: DocumentAdminFilter, now: Date): Promise<number> {
    return this.collection.countDocuments(documentAdminFilter(filter, now));
  }

  async all(filter: DocumentAdminFilter, now: Date, limit: number): Promise<InvoicingDocument[]> {
    const docs = await this.collection.find(documentAdminFilter(filter, now)).sort(DOCUMENT_ADMIN_SORT).limit(limit).toArray();
    return docs.map(invoicingDocumentFromDocument);
  }

  async creditNotesOf(documentId: string): Promise<InvoicingDocument[]> {
    const docs = await this.collection.find({ originalDocumentId: documentId }).sort(DOCUMENT_ADMIN_SORT).toArray();
    return docs.map(invoicingDocumentFromDocument);
  }
}

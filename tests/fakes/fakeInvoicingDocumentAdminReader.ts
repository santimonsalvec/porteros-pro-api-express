import type { DocumentAdminFilter, IInvoicingDocumentAdminReader } from '../../src/application/features/invoicing/common/adminPorts.js';
import type { InvoicingDocument } from '../../src/domain/invoicing/invoicingDocument.js';
import type { FakeInvoicingDocumentRepository } from './fakeInvoicingDocumentRepository.js';

/** The admin's document reads over the fake repository, filtered in memory like the Mongo reader. */
export class FakeInvoicingDocumentAdminReader implements IInvoicingDocumentAdminReader {
  constructor(private readonly documents: FakeInvoicingDocumentRepository) {}

  private matching(filter: DocumentAdminFilter, now: Date): InvoicingDocument[] {
    return this.documents
      .all()
      .filter((document) => !filter.status || document.status === filter.status)
      .filter((document) => !filter.kind || document.kind === filter.kind)
      .filter((document) => !filter.countryId || document.countryId === filter.countryId)
      .filter((document) => !filter.marketIds || filter.marketIds.includes(document.marketId))
      .filter((document) => !filter.from || document.occurredAt >= filter.from)
      .filter((document) => !filter.to || document.occurredAt < filter.to)
      .filter((document) => !filter.stale || document.isStale(now))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  }

  async list(filter: DocumentAdminFilter & { page: number; pageSize: number }, now: Date) {
    const all = this.matching(filter, now);
    return { items: all.slice((filter.page - 1) * filter.pageSize, filter.page * filter.pageSize), totalItems: all.length };
  }

  async count(filter: DocumentAdminFilter, now: Date): Promise<number> {
    return this.matching(filter, now).length;
  }

  async all(filter: DocumentAdminFilter, now: Date, limit: number): Promise<InvoicingDocument[]> {
    return this.matching(filter, now).slice(0, limit);
  }

  async creditNotesOf(documentId: string): Promise<InvoicingDocument[]> {
    return this.documents.all().filter((document) => document.originalDocumentId === documentId);
  }
}

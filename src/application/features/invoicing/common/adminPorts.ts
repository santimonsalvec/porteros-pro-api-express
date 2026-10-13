import type { InvoicingDocument, InvoicingDocumentKind, InvoicingDocumentStatus } from '../../../../domain/invoicing/invoicingDocument.js';

/** The admin's document filters (admin spec 007, FR-007). Dates bound the charge (`occurredAt`): `[from, to)`. */
export interface DocumentAdminFilter {
  status?: InvoicingDocumentStatus;
  kind?: InvoicingDocumentKind;
  countryId?: string;
  from?: Date;
  to?: Date;
  /** Pending or awaiting the authority for more than 24 hours (`isStale`). */
  stale?: boolean;
}

export interface IInvoicingDocumentAdminReader {
  list(filter: DocumentAdminFilter & { page: number; pageSize: number }, now: Date): Promise<{ items: InvoicingDocument[]; totalItems: number }>;
  count(filter: DocumentAdminFilter, now: Date): Promise<number>;
  /** Every match in list order, at most `limit` (the export). */
  all(filter: DocumentAdminFilter, now: Date, limit: number): Promise<InvoicingDocument[]>;
  /** The credit notes that correct an invoice. */
  creditNotesOf(documentId: string): Promise<InvoicingDocument[]>;
}

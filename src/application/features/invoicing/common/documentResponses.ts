import type { InvoicingDocument } from '../../../../domain/invoicing/invoicingDocument.js';

/** A document as its goalkeeper sees it (contracts §1): no buyer data, no provider internals. */
export interface DocumentItemResponse {
  documentId: string;
  kind: InvoicingDocument['kind'];
  concept: InvoicingDocument['concept'];
  status: InvoicingDocument['status'];
  number: string | null;
  cufe: string | null;
  base: number;
  vat: number;
  total: number;
  currency: string;
  vatRatePercent: number;
  bookingId: string | null;
  originalDocumentId: string | null;
  occurredAt: string;
  issuedAt: string | null;
  downloadable: boolean;
}

/** A document as administrators see it (contracts §2). Never a credential. */
export interface AdminDocumentItemResponse extends DocumentItemResponse {
  goalkeeperId: string;
  countryId: string;
  provider: string | null;
  buyer: InvoicingDocument['buyer'];
  attempts: number;
  lastError: { kind: string; code: string; message: string; at: string } | null;
  stale: boolean;
}

export function toDocumentItem(document: InvoicingDocument): DocumentItemResponse {
  return {
    documentId: document.id,
    kind: document.kind,
    concept: document.concept,
    status: document.status,
    number: document.provider?.number ?? null,
    cufe: document.provider?.cufe ?? null,
    base: document.base,
    vat: document.vat,
    total: document.total,
    currency: document.currency,
    vatRatePercent: document.vatRateBps / 100,
    bookingId: document.bookingId,
    originalDocumentId: document.originalDocumentId,
    occurredAt: document.occurredAt.toISOString(),
    issuedAt: document.issuedAt?.toISOString() ?? null,
    downloadable: document.status === 'issued',
  };
}

export function toAdminDocumentItem(document: InvoicingDocument, now: Date): AdminDocumentItemResponse {
  return {
    ...toDocumentItem(document),
    goalkeeperId: document.goalkeeperId,
    countryId: document.countryId,
    provider: document.provider?.name ?? null,
    buyer: { ...document.buyer },
    attempts: document.attempts,
    lastError: document.lastError
      ? { kind: document.lastError.kind, code: document.lastError.code, message: document.lastError.message, at: document.lastError.at.toISOString() }
      : null,
    stale: document.isStale(now),
  };
}

import { InvoicingDocument, type InvoicingDocumentProps } from '../../src/domain/invoicing/invoicingDocument.js';

const NOW = new Date('2026-10-13T14:00:00.000Z');

/** A document in any state, for the admin's reads (admin spec 007). */
export function buildDocument(overrides: Partial<InvoicingDocumentProps> = {}): InvoicingDocument {
  const created = InvoicingDocument.create({
    id: 'doc-1',
    kind: 'invoice',
    concept: 'commission',
    goalkeeperId: 'gk-1',
    countryId: 'country-co',
    marketId: 'city-cali',
    sourceEventId: 'e-1',
    sourceMovementId: `m-${overrides.id ?? 'doc-1'}`,
    vatMovementId: 'm-vat',
    bookingId: 'b-1',
    requestId: 'r-1',
    originalDocumentId: null,
    base: 7000,
    vat: 1330,
    vatRateBps: 1900,
    currency: 'COP',
    buyer: { documentType: 'CC', documentNumber: '1020304050', firstName: 'Juan', lastName: 'Pérez', email: 'juan@x.co', cityId: 'city-cali', address: null, addressComplement: null },
    occurredAt: NOW,
    createdAt: NOW,
  });
  // A credit note waits for its invoice, as `create` sets it.
  const waitingFor = overrides.originalDocumentId ?? created.waitingFor;
  return InvoicingDocument.rehydrate({ ...created.toProps(), waitingFor, ...overrides });
}

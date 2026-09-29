import { describe, expect, it } from 'vitest';
import { GetDocumentFileQuery } from '../../../../../src/application/features/invoicing/queries/getDocumentFile/getDocumentFileQuery.js';
import { GetDocumentFileQueryHandler } from '../../../../../src/application/features/invoicing/queries/getDocumentFile/getDocumentFileQueryHandler.js';
import { GetMyDocumentQuery } from '../../../../../src/application/features/invoicing/queries/getMyDocument/getMyDocumentQuery.js';
import { GetMyDocumentQueryHandler } from '../../../../../src/application/features/invoicing/queries/getMyDocument/getMyDocumentQueryHandler.js';
import { ListMyDocumentsQuery } from '../../../../../src/application/features/invoicing/queries/listMyDocuments/listMyDocumentsQuery.js';
import { ListMyDocumentsQueryHandler } from '../../../../../src/application/features/invoicing/queries/listMyDocuments/listMyDocumentsQueryHandler.js';
import { InvoicingHarness } from './invoicingHarness.js';

/** gk-1: two invoices and a credit note; gk-2: one invoice. */
async function world() {
  const harness = new InvoicingHarness();
  await harness.goalkeeper('gk-1');
  await harness.goalkeeper('gk-2');
  for (const [bookingId, goalkeeperId] of [['b-1', 'gk-1'], ['b-2', 'gk-1'], ['b-3', 'gk-2']] as const) {
    await harness.handler().handle((await harness.charge(bookingId, 1900, goalkeeperId)).event);
    harness.clock.advance(60_000);
  }
  await harness.handler().handle(await harness.refund('b-1', 'gk-1'));
  return harness;
}

describe('the goalkeeper\'s documents (US3)', () => {
  it('lists only their own, newest first, by page', async () => {
    const harness = await world();
    const handler = new ListMyDocumentsQueryHandler(harness.wallet.profiles, harness.documents);

    const first = await handler.handle(new ListMyDocumentsQuery('gk-1', 1, 2));
    const second = await handler.handle(new ListMyDocumentsQuery('gk-1', 2, 2));

    expect(first).toMatchObject({ outcome: 'success', totalItems: 3, totalPages: 2 });
    if (first.outcome !== 'success' || second.outcome !== 'success') return;
    expect([...first.items, ...second.items].map((item) => [item.kind, item.bookingId])).toEqual([
      ['credit_note', 'b-1'],
      ['invoice', 'b-2'],
      ['invoice', 'b-1'],
    ]);
    expect(first.items[1]).toMatchObject({ status: 'issued', number: expect.stringMatching(/^FV-/), base: 7000, vat: 1330, total: 8330, vatRatePercent: 19, downloadable: true });
    expect(first.items[1]).not.toHaveProperty('buyer');
    expect(await handler.handle(new ListMyDocumentsQuery('nobody', 1, 20))).toEqual({ outcome: 'not_a_goalkeeper' });
  });

  it('reads one of their documents, and never another goalkeeper\'s', async () => {
    const harness = await world();
    const handler = new GetMyDocumentQueryHandler(harness.documents);
    const other = harness.documents.all().find((document) => document.goalkeeperId === 'gk-2')!;

    expect(await handler.handle(new GetMyDocumentQuery('gk-2', other.id))).toMatchObject({ outcome: 'success', document: { documentId: other.id } });
    expect(await handler.handle(new GetMyDocumentQuery('gk-1', other.id))).toEqual({ outcome: 'not_found' });
  });

  it('serves the provider\'s file of an issued document through its own provider', async () => {
    const harness = await world();
    const document = harness.documents.all()[0]!;
    harness.provider.files.set(`${document.provider!.id}:pdf`, { contentType: 'application/pdf', fileName: 'FV-1-1.pdf', content: Buffer.from('%PDF') });
    const handler = new GetDocumentFileQueryHandler(harness.deps);

    expect(await handler.handle(new GetDocumentFileQuery('gk-1', document.id, 'pdf'))).toEqual({
      outcome: 'success',
      file: { contentType: 'application/pdf', fileName: 'FV-1-1.pdf', content: Buffer.from('%PDF') },
    });
    expect(await handler.handle(new GetDocumentFileQuery('gk-1', document.id, 'xml'))).toEqual({ outcome: 'file_not_available' });
    expect(await handler.handle(new GetDocumentFileQuery('gk-2', document.id, 'pdf'))).toEqual({ outcome: 'not_found' });
    harness.provider.script('transient');
    expect(await handler.handle(new GetDocumentFileQuery('gk-1', document.id, 'pdf'))).toEqual({ outcome: 'provider_unavailable' });
  });

  it('refuses the file of a document not issued yet', async () => {
    const harness = new InvoicingHarness();
    harness.enabled = false;
    await harness.goalkeeper();
    await harness.handler().handle((await harness.charge()).event);

    expect(await new GetDocumentFileQueryHandler(harness.deps).handle(new GetDocumentFileQuery('gk-1', harness.documents.all()[0]!.id, 'pdf'))).toEqual({
      outcome: 'not_issued',
      status: 'pending',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { InvoicingHarness } from './invoicingHarness.js';

const MINUTE = 60_000;

describe('a credit note for each refund (US2)', () => {
  it('issues one credit note for the commission and its VAT, referencing the invoice', async () => {
    const harness = new InvoicingHarness();
    await harness.goalkeeper();
    const { event } = await harness.charge();
    await harness.handler().handle(event);

    const refunded = await harness.refund();
    await harness.handler().handle(refunded);

    const [invoice, note] = harness.documents.all();
    expect(note).toMatchObject({
      kind: 'credit_note',
      concept: 'commission',
      status: 'issued',
      originalDocumentId: invoice!.id,
      sourceMovementId: refunded.payload.movementId,
      vatMovementId: refunded.payload.vatMovementId,
      base: 7000,
      vat: 1330,
      total: 8330,
    });
    expect(harness.provider.creditNotes()).toMatchObject([{ originalProviderId: invoice!.provider!.id }]);
  });

  it('never creates a second credit note when the refund event comes again', async () => {
    const harness = new InvoicingHarness();
    await harness.goalkeeper();
    const { event } = await harness.charge();
    await harness.handler().handle(event);
    const refunded = await harness.refund();

    await harness.handler().handle(refunded);
    await harness.handler().handle(refunded);

    expect(harness.documents.all().filter((document) => document.kind === 'credit_note')).toHaveLength(1);
    expect(harness.provider.creditNotes()).toHaveLength(1);
  });

  it('waits for its invoice, then is issued after it', async () => {
    const harness = new InvoicingHarness();
    await harness.goalkeeper();
    const { event } = await harness.charge();
    harness.provider.script('transient');
    await harness.handler().handle(event);

    await harness.handler().handle(await harness.refund());
    const note = harness.documents.all().find((document) => document.kind === 'credit_note')!;
    expect(note).toMatchObject({ status: 'pending', waitingFor: note.originalDocumentId });
    expect(harness.provider.creditNotes()).toEqual([]);

    harness.clock.advance(MINUTE);
    await harness.job().run(harness.clock.now());
    expect(harness.documents.all().map((document) => document.status)).toEqual(['issued', 'issued']);
    // The invoice reached the provider before its credit note.
    expect(harness.provider.calls.filter((call) => call.operation !== 'status').map((call) => call.operation)).toEqual(['invoice', 'invoice', 'credit_note']);
  });

  it('creates the invoice first when the refund event arrives before the charge\'s', async () => {
    const harness = new InvoicingHarness();
    await harness.goalkeeper();
    await harness.charge();

    await harness.handler().handle(await harness.refund());

    expect(harness.documents.all().map((document) => document.kind)).toEqual(['invoice', 'credit_note']);
    harness.clock.advance(MINUTE);
    await harness.job().run(harness.clock.now());
    expect(harness.documents.all().every((document) => document.status === 'issued')).toBe(true);
    expect(harness.provider.invoices()).toHaveLength(1);
  });

  it('sends the credit note to its invoice\'s provider, with its configuration, after the country changes its settings', async () => {
    const harness = new InvoicingHarness();
    await harness.goalkeeper();
    const { event } = await harness.charge();
    await harness.handler().handle(event);
    harness.settings.seed('country-co', { ...harness.provider.invoices()[0]!.context.config, creditNoteDocumentId: 1 });

    await harness.handler().handle(await harness.refund());

    expect(harness.provider.creditNotes()[0]!.context.config).toMatchObject({ creditNoteDocumentId: 24447 });
  });

  it('gives back no VAT and issues a credit note without VAT at 0 %', async () => {
    const harness = new InvoicingHarness();
    await harness.goalkeeper();
    const { event } = await harness.charge('b-1', 0);
    await harness.handler().handle(event);

    await harness.handler().handle(await harness.refund());

    expect(harness.wallet.store.movements().filter((movement) => movement.type === 'commission_vat_refund')).toEqual([]);
    expect(harness.documents.all()[1]).toMatchObject({ kind: 'credit_note', base: 7000, vat: 0, total: 7000 });
  });
});

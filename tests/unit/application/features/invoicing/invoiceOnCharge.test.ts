import { describe, expect, it } from 'vitest';
import { issueDocument } from '../../../../../src/application/features/invoicing/common/issueDocument.js';
import { TEST_INVOICING_CREDENTIALS } from '../../../../fakes/fakeInvoicingSecrets.js';
import { InvoicingHarness } from './invoicingHarness.js';

const MINUTE = 60_000;

async function charged(harness: InvoicingHarness, rateBps = 1900) {
  await harness.goalkeeper();
  return harness.charge('b-1', rateBps);
}

describe('invoicing a commission charge (US1)', () => {
  it('creates one document from the event and issues it through the country\'s provider', async () => {
    const harness = new InvoicingHarness();
    const { event, movements } = await charged(harness);

    await harness.handler().handle(event);

    const [document] = harness.documents.all();
    expect(harness.documents.all()).toHaveLength(1);
    expect(document).toMatchObject({
      kind: 'invoice',
      concept: 'commission',
      status: 'issued',
      goalkeeperId: 'gk-1',
      countryId: 'country-co',
      sourceEventId: event.id,
      sourceMovementId: movements[0]!.id,
      vatMovementId: movements[1]!.id,
      bookingId: 'b-1',
      base: 7000,
      vat: 1330,
      total: 8330,
      vatRateBps: 1900,
      buyer: { documentType: 'CC', documentNumber: '1020304050', firstName: 'Ana', lastName: 'Portera', email: 'gk-1@example.com', cityId: 'city-cali' },
      provider: { name: 'siigo', number: 'FV-1-1', cufe: 'cufe-1' },
    });
    expect(harness.provider.invoices()).toHaveLength(1);
    expect(harness.provider.invoices()[0]!.context).toMatchObject({ countryCode: 'CO', credentials: TEST_INVOICING_CREDENTIALS, config: { vatTaxId: 13156 } });
  });

  it('never creates or sends a second document when the event is delivered again', async () => {
    const harness = new InvoicingHarness();
    const { event } = await charged(harness);

    await harness.handler().handle(event);
    await harness.handler().handle(event);

    expect(harness.documents.all()).toHaveLength(1);
    expect(harness.provider.invoices()).toHaveLength(1);
  });

  it('invoices a charge without VAT at 0 %', async () => {
    const harness = new InvoicingHarness();
    const { event } = await charged(harness, 0);

    await harness.handler().handle(event);

    expect(harness.documents.all()[0]).toMatchObject({ base: 7000, vat: 0, total: 7000, vatRateBps: 0, vatMovementId: null, status: 'issued' });
  });

  it('keeps the document pending through an outage, and the sweep issues it once afterwards', async () => {
    const harness = new InvoicingHarness();
    const { event } = await charged(harness);
    harness.provider.script('transient');

    await harness.handler().handle(event);
    expect(harness.documents.all()[0]).toMatchObject({ status: 'pending', attempts: 1, lastError: { kind: 'transient' } });

    expect(await harness.job().run(harness.clock.now())).toContain('0 issued');
    harness.clock.advance(MINUTE);
    expect(await harness.job().run(harness.clock.now())).toBe('1 issued, 0 awaiting, 0 rejected, 0 retried, 0 recovered');
    expect(harness.documents.all()[0]!.status).toBe('issued');
  });

  it('recognizes a document the provider created when its answer was lost', async () => {
    const harness = new InvoicingHarness();
    const { event } = await charged(harness);
    harness.provider.script('lost_answer');

    await harness.handler().handle(event);
    harness.clock.advance(MINUTE);
    await harness.job().run(harness.clock.now());

    expect(harness.documents.all()[0]!.status).toBe('issued');
    expect(harness.provider.created.size).toBe(1);
    expect(new Set(harness.provider.invoices().map((call) => call.idempotencyKey)).size).toBe(1);
  });

  it('waits for the authority, then records its decision', async () => {
    const harness = new InvoicingHarness();
    const { event } = await charged(harness);
    harness.provider.script('awaiting');

    await harness.handler().handle(event);
    expect(harness.documents.all()[0]!.status).toBe('awaiting_authority');

    harness.clock.advance(5 * MINUTE);
    expect(await harness.job().run(harness.clock.now())).toContain('1 issued');
    expect(harness.documents.all()[0]).toMatchObject({ status: 'issued', provider: { cufe: expect.any(String) } });
  });

  it('marks a document the authority rejects, and never retries it on its own', async () => {
    const harness = new InvoicingHarness();
    const { event } = await charged(harness);
    harness.provider.script('invalid');

    await harness.handler().handle(event);
    harness.clock.advance(60 * MINUTE);
    await harness.job().run(harness.clock.now());

    expect(harness.documents.all()[0]).toMatchObject({ status: 'rejected', lastError: { kind: 'rejected', code: 'provider_validation' } });
    expect(harness.provider.invoices()).toHaveLength(1);
  });

  it('waits for a country without a provider, and issues once it has one', async () => {
    const harness = new InvoicingHarness();
    harness.settings.clear();
    const { event } = await charged(harness);

    await harness.handler().handle(event);
    expect(harness.documents.all()[0]).toMatchObject({ status: 'pending', lastError: { code: 'provider_not_configured' } });

    harness.settings.seed();
    harness.clock.advance(15 * MINUTE);
    await harness.job().run(harness.clock.now());
    expect(harness.documents.all()[0]!.status).toBe('issued');
  });

  it('waits without credentials, and never logs a secret', async () => {
    const harness = new InvoicingHarness();
    harness.secrets.credentials.clear();
    const { event } = await charged(harness);

    await harness.handler().handle(event);

    expect(harness.documents.all()[0]).toMatchObject({ status: 'pending', lastError: { code: 'provider_credentials_missing' } });
    expect(JSON.stringify(harness.logger.entries)).not.toContain(TEST_INVOICING_CREDENTIALS.accessKey);
  });

  it('recovers, through the safety net, a charge whose event was lost', async () => {
    const harness = new InvoicingHarness();
    const { movements } = await charged(harness);

    harness.clock.advance(9 * MINUTE);
    expect(await harness.job().run(harness.clock.now())).toContain('0 recovered');
    harness.clock.advance(2 * MINUTE);
    expect(await harness.job().run(harness.clock.now())).toBe('1 issued, 0 awaiting, 0 rejected, 0 retried, 1 recovered');
    expect(harness.documents.all()[0]).toMatchObject({ sourceMovementId: movements[0]!.id, sourceEventId: null, status: 'issued' });
  });

  it('leaves documents untouched while invoicing is disabled', async () => {
    const harness = new InvoicingHarness();
    harness.enabled = false;
    const { event } = await charged(harness);

    await harness.handler().handle(event);

    expect(harness.documents.all()[0]).toMatchObject({ status: 'pending', attempts: 0 });
    expect(harness.provider.calls).toEqual([]);
  });

  it('warns about documents still pending after 24 hours', async () => {
    const harness = new InvoicingHarness();
    harness.enabled = false;
    const { event } = await charged(harness);
    await harness.handler().handle(event);

    harness.clock.advance(24 * 60 * MINUTE + MINUTE);
    await harness.job().run(harness.clock.now());

    expect(harness.logger.entries).toContainEqual(expect.objectContaining({ level: 'warn', entry: { outcome: 'invoicing_pending_too_long', count: 1 } }));
  });

  it('keeps sending a document to the provider it was bound to after the country changes its settings', async () => {
    const harness = new InvoicingHarness();
    const { event } = await charged(harness);
    harness.provider.script('transient');
    await harness.handler().handle(event);
    harness.settings.seed('country-co', { ...harness.provider.invoices()[0]!.context.config, sellerId: 999 });

    harness.clock.advance(MINUTE);
    await issueDocument(harness.deps, harness.documents.all()[0]!, harness.clock.now());

    expect(harness.provider.invoices().map((call) => call.context.config.sellerId)).toEqual([629, 629]);
  });
});

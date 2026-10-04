import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, TEST_INTERNAL_TOKEN } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

/** Colombia at 19 % VAT with Siigo configured; events reach the consumers during the request. */
async function setUp(balance = 10000) {
  const context = await buildTestApp({ eventsMode: 'local' });
  context.clock.set(MATCH_NOW);
  context.taxSettingsRepository.seed('country-co', 1900);
  context.invoicingSettingsRepository.seed();
  const client = await signInClient(context, 'sub-2301');
  const goalkeeper = await signInGoalkeeper(context, 'sub-2302');
  await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: balance, reason: 'Saldo de pruebas', operationKey: 'k-gk' });
  const created = await createRequestAsClient(context, client.token);
  return { context, client, goalkeeper, bookingId: created.bookings[0]!.bookingId };
}

function as(context: TestApp, token: string) {
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  return {
    accept: (bookingId: string) => auth(request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/accept`)),
    available: () => auth(request(context.app).get('/goalkeepers/me/available-bookings')),
    movements: () => auth(request(context.app).get('/goalkeepers/me/wallet/movements')),
    wallet: () => auth(request(context.app).get('/goalkeepers/me/wallet')),
  };
}

describe('Invoicing — US1: every commission charged gets one electronic invoice', () => {
  it('debits the commission plus VAT and issues one invoice through Colombia\'s provider', async () => {
    const { context, goalkeeper, bookingId } = await setUp();

    const accepted = await as(context, goalkeeper.token).accept(bookingId);

    expect(accepted.status).toBe(201);
    const movements = await as(context, goalkeeper.token).movements();
    expect(movements.body.items.slice(0, 2).map((item: { type: string; amount: number; taxRateBps?: number }) => [item.type, item.amount, item.taxRateBps])).toEqual([
      ['commission_vat', -1330, 1900],
      ['commission_charge', -7000, undefined],
    ]);
    expect((await as(context, goalkeeper.token).wallet()).body.balance).toBe(1670);
    expect(context.invoicingDocumentRepository.all()).toMatchObject([
      { kind: 'invoice', status: 'issued', goalkeeperId: goalkeeper.userId, bookingId, base: 7000, vat: 1330, total: 8330 },
    ]);
    expect(context.invoicingProvider.invoices()).toHaveLength(1);
  });

  it('shows and refuses a match whose commission is covered but not its VAT', async () => {
    const { context, goalkeeper, bookingId } = await setUp(7500);

    const available = await as(context, goalkeeper.token).available();
    const accepted = await as(context, goalkeeper.token).accept(bookingId);
    const wallet = await as(context, goalkeeper.token).wallet();

    expect(available.body).toMatchObject({ items: [], unavailableReason: 'insufficient_funds', missingAmount: 830 });
    expect(accepted.status).toBe(409);
    expect(accepted.body).toMatchObject({ error: 'insufficient_funds', missingAmount: 830 });
    expect(wallet.body.offers).toEqual({ canSeeOffers: false, lowestCommission: 7000, lowestCharge: 8330, vatRateBps: 1900, missingAmount: 830 });
    expect(context.invoicingDocumentRepository.all()).toEqual([]);
  });

  it('lists available matches with their VAT and total', async () => {
    const { context, goalkeeper, bookingId } = await setUp();

    const available = await as(context, goalkeeper.token).available();

    expect(available.body.items[0]).toMatchObject({ bookingId, commission: 7000, vat: 1330, totalCharge: 8330 });
  });

  it('issues the invoice later when the provider was down at the acceptance', async () => {
    const { context, goalkeeper, bookingId } = await setUp();
    context.invoicingProvider.script('transient');

    await as(context, goalkeeper.token).accept(bookingId);
    expect(context.invoicingDocumentRepository.all()[0]!.status).toBe('pending');

    context.clock.advance(60_000);
    await request(context.app).post('/internal/sweep').set('Authorization', `Bearer ${TEST_INTERNAL_TOKEN}`);

    expect(context.invoicingDocumentRepository.all()[0]!.status).toBe('issued');
    expect(context.invoicingProvider.created.size).toBe(1);
  });
});

describe('Invoicing — US2: a credit note for each refund', () => {
  it('gives back the commission and its VAT when the client cancels, and issues a credit note for the invoice', async () => {
    const { context, client, goalkeeper, bookingId } = await setUp();
    await as(context, goalkeeper.token).accept(bookingId);
    const requestId = context.bookingRepository.all().find((booking) => booking.id === bookingId)!.requestId;

    const cancelled = await request(context.app)
      .post(`/goalkeeper-requests/bookings/${requestId}/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({});
    // The refund's event is published by the sweep (it isn't relayed by the cancellation).
    context.clock.advance(60_000);
    await request(context.app).post('/internal/sweep').set('Authorization', `Bearer ${TEST_INTERNAL_TOKEN}`);

    expect(cancelled.status).toBe(200);
    expect((await as(context, goalkeeper.token).wallet()).body.balance).toBe(10000);
    const [invoice, note] = context.invoicingDocumentRepository.all();
    expect(note).toMatchObject({ kind: 'credit_note', status: 'issued', originalDocumentId: invoice!.id, base: 7000, vat: 1330, total: 8330 });
    expect(context.invoicingProvider.creditNotes()).toHaveLength(1);
  });
});

describe('GET /goalkeepers/me/invoices — US3: the goalkeeper consults and downloads their documents', () => {
  it('lists the invoice and downloads its PDF; another goalkeeper can\'t read it', async () => {
    const { context, goalkeeper, bookingId } = await setUp();
    await as(context, goalkeeper.token).accept(bookingId);
    const document = context.invoicingDocumentRepository.all()[0]!;
    context.invoicingProvider.files.set(`${document.provider!.id}:pdf`, { contentType: 'application/pdf', fileName: 'FV-1-1.pdf', content: Buffer.from('%PDF-1.4') });
    const other = await signInGoalkeeper(context, 'sub-2303');
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const list = await request(context.app).get('/goalkeepers/me/invoices').set(auth(goalkeeper.token));
    const pdf = await request(context.app).get(`/goalkeepers/me/invoices/${document.id}/pdf`).set(auth(goalkeeper.token));
    const xml = await request(context.app).get(`/goalkeepers/me/invoices/${document.id}/xml`).set(auth(goalkeeper.token));
    const foreign = await request(context.app).get(`/goalkeepers/me/invoices/${document.id}`).set(auth(other.token));

    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ totalItems: 1, items: [{ documentId: document.id, kind: 'invoice', status: 'issued', total: 8330, downloadable: true }] });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toBe('attachment; filename="FV-1-1.pdf"');
    expect(Buffer.from(pdf.body as Buffer).toString()).toBe('%PDF-1.4');
    expect(xml.status).toBe(404);
    expect(xml.body.error).toBe('file_not_available');
    expect(foreign.status).toBe(404);
    expect(foreign.body.error).toBe('invoicing_document_not_found');
  });

  it('409 for the file of a document not issued yet', async () => {
    const { context, goalkeeper, bookingId } = await setUp();
    context.invoicingProvider.script('transient');
    await as(context, goalkeeper.token).accept(bookingId);
    const document = context.invoicingDocumentRepository.all()[0]!;

    const pdf = await request(context.app).get(`/goalkeepers/me/invoices/${document.id}/pdf`).set('Authorization', `Bearer ${goalkeeper.token}`);

    expect(pdf.status).toBe(409);
    expect(pdf.body).toMatchObject({ error: 'document_not_issued', status: 'pending' });
  });
});

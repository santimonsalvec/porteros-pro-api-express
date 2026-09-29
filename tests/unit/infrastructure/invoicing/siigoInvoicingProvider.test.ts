import { describe, expect, it, vi } from 'vitest';
import { InvoicingProviderError, type ProviderBuyer, type ProviderContext } from '../../../../src/application/features/invoicing/common/ports.js';
import { InvoicingDocument } from '../../../../src/domain/invoicing/invoicingDocument.js';
import { SiigoInvoicingProvider } from '../../../../src/infrastructure/invoicing/siigoInvoicingProvider.js';

const NOW = new Date('2026-09-29T15:00:00.000Z');
const CONTEXT: ProviderContext = {
  countryCode: 'CO',
  credentials: { username: 'api@porteros.co', accessKey: 'secret-access-key' },
  config: {
    partnerId: 'PorterosPRO',
    invoiceDocumentId: 24446,
    creditNoteDocumentId: 24447,
    sellerId: 629,
    commissionProductCode: 'COMISION',
    penaltyProductCode: 'PENALIDAD',
    vatTaxId: 13156,
    paymentMethodId: 5636,
  },
};
const BUYER: ProviderBuyer = {
  documentType: 'CC',
  documentNumber: '1020304050',
  firstName: 'Ana',
  lastName: 'Portera',
  email: 'ana@example.com',
  cityId: 'city-medellin',
  cityName: 'Medellín',
  stateCode: '05',
  cityCode: '05001',
  countryCode: 'CO',
};

function doc(overrides: Partial<Parameters<typeof InvoicingDocument.create>[0]> = {}) {
  return InvoicingDocument.create({
    id: '0192f000-0000-7000-8000-000000000001',
    kind: 'invoice',
    concept: 'commission',
    goalkeeperId: 'gk-1',
    countryId: 'country-co',
    sourceEventId: 'e-1',
    sourceMovementId: 'm-1',
    vatMovementId: 'm-2',
    bookingId: 'b-1',
    requestId: 'r-1',
    originalDocumentId: null,
    base: 7000,
    vat: 1330,
    vatRateBps: 1900,
    currency: 'COP',
    buyer: BUYER,
    occurredAt: NOW,
    createdAt: NOW,
    ...overrides,
  });
}

type Route = (init: RequestInit) => { status: number; body?: unknown };

/** A `fetch` answering by "METHOD path" (query string included), recording every call. */
function siigo(routes: Record<string, Route | Array<{ status: number; body?: unknown }>>) {
  const calls: Array<{ key: string; headers: Record<string, string>; body: unknown }> = [];
  const fetchFn = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const path = String(url).replace('https://api.siigo.com', '');
    const key = `${init.method ?? 'GET'} ${path}`;
    calls.push({ key, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const route = routes[key];
    const answer = Array.isArray(route) ? route.shift() : route?.(init);
    if (!answer) throw new Error(`unexpected ${key}`);
    return new Response(answer.body === undefined ? '' : JSON.stringify(answer.body), { status: answer.status });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

const AUTH = { 'POST /auth': () => ({ status: 201, body: { access_token: 'tok-1', expires_in: 86400 } }) };
const NO_CUSTOMER = { 'GET /v1/customers?identification=1020304050': () => ({ status: 200, body: { results: [] } }) };
const CREATE_CUSTOMER = { 'POST /v1/customers': () => ({ status: 201, body: { id: 'c-1' } }) };
const accepted = { id: 'sg-1', name: 'FV-2-22', stamp: { status: 'Accepted', cufe: 'cufe-1' } };

describe('SiigoInvoicingProvider', () => {
  it('authenticates, creates the buyer and the invoice with its idempotency key', async () => {
    const { fetchFn, calls } = siigo({ ...AUTH, ...NO_CUSTOMER, ...CREATE_CUSTOMER, 'POST /v1/invoices': () => ({ status: 201, body: accepted }) });
    const document = doc();

    const result = await new SiigoInvoicingProvider('https://api.siigo.com', fetchFn, () => NOW).createInvoice(document, BUYER, CONTEXT);

    expect(result).toEqual({ id: 'sg-1', number: 'FV-2-22', cufe: 'cufe-1', status: 'accepted' });
    expect(calls[0]).toMatchObject({ key: 'POST /auth', body: { username: 'api@porteros.co', access_key: 'secret-access-key' }, headers: { 'Partner-Id': 'PorterosPRO' } });
    expect(calls[2]!.body).toMatchObject({
      person_type: 'Person',
      id_type: '13',
      identification: '1020304050',
      name: ['Ana', 'Portera'],
      address: { address: 'Medellín', city: { state_code: '05', city_code: '05001' } },
      contacts: [{ email: 'ana@example.com' }],
    });
    const invoice = calls[3]!;
    expect(invoice.headers).toMatchObject({ Authorization: 'Bearer tok-1', 'Partner-Id': 'PorterosPRO', 'Idempotency-Key': document.idempotencyKey() });
    expect(invoice.body).toEqual({
      document: { id: 24446 },
      date: '2026-09-29',
      customer: { identification: '1020304050', branch_office: 0 },
      seller: 629,
      observations: 'Reserva b-1',
      items: [{ code: 'COMISION', description: 'Comisión por servicio de portero', quantity: 1, price: 7000, discount: 0, taxes: [{ id: 13156 }] }],
      payments: [{ id: 5636, value: 8330, due_date: '2026-09-29' }],
      stamp: { send: true },
      mail: { send: true },
    });
  });

  it('reuses the token and an existing buyer', async () => {
    const existing = { 'GET /v1/customers?identification=1020304050': () => ({ status: 200, body: { results: [{ id: 'c-1', name: ['Ana', 'Portera'], contacts: [{ email: 'ana@example.com' }] }] } }) };
    const { fetchFn, calls } = siigo({ ...AUTH, ...existing, 'POST /v1/invoices': () => ({ status: 201, body: accepted }) });
    const provider = new SiigoInvoicingProvider('https://api.siigo.com', fetchFn, () => NOW);

    await provider.createInvoice(doc(), BUYER, CONTEXT);
    await provider.createInvoice(doc(), BUYER, CONTEXT);

    expect(calls.filter((call) => call.key === 'POST /auth')).toHaveLength(1);
    expect(calls.filter((call) => call.key.startsWith('POST /v1/customers') || call.key.startsWith('PUT'))).toEqual([]);
  });

  it('updates a buyer whose email changed', async () => {
    const existing = { 'GET /v1/customers?identification=1020304050': () => ({ status: 200, body: { results: [{ id: 'c-1', name: ['Ana', 'Portera'], contacts: [{ email: 'old@example.com' }] }] } }) };
    const { fetchFn, calls } = siigo({ ...AUTH, ...existing, 'PUT /v1/customers/c-1': () => ({ status: 200, body: {} }), 'POST /v1/invoices': () => ({ status: 201, body: accepted }) });

    await new SiigoInvoicingProvider('https://api.siigo.com', fetchFn, () => NOW).createInvoice(doc(), BUYER, CONTEXT);

    expect(calls.map((call) => call.key)).toContain('PUT /v1/customers/c-1');
  });

  it('sends no tax on a document without VAT', async () => {
    const { fetchFn, calls } = siigo({ ...AUTH, ...NO_CUSTOMER, ...CREATE_CUSTOMER, 'POST /v1/invoices': () => ({ status: 201, body: accepted }) });

    await new SiigoInvoicingProvider('https://api.siigo.com', fetchFn, () => NOW).createInvoice(doc({ vat: 0, vatRateBps: 0 }), BUYER, CONTEXT);

    expect(calls[3]!.body).toMatchObject({ items: [{ taxes: [] }], payments: [{ value: 7000 }] });
  });

  it('creates a credit note referencing the original', async () => {
    const { fetchFn, calls } = siigo({ ...AUTH, ...NO_CUSTOMER, ...CREATE_CUSTOMER, 'POST /v1/credit-notes': () => ({ status: 201, body: { ...accepted, id: 'sg-2', name: 'NC-1-1' } }) });
    const original = doc().bindProvider('siigo', {}, NOW).markIssued({ id: 'sg-1', number: 'FV-2-22', cufe: 'cufe-1' }, NOW);
    const note = doc({ id: '0192f000-0000-7000-8000-000000000002', kind: 'credit_note', originalDocumentId: original.id, sourceMovementId: 'm-3' });

    const result = await new SiigoInvoicingProvider('https://api.siigo.com', fetchFn, () => NOW).createCreditNote(note, original, BUYER, CONTEXT);

    expect(result).toMatchObject({ id: 'sg-2', number: 'NC-1-1', status: 'accepted' });
    expect(calls[3]!.body).toMatchObject({ document: { id: 24447 }, invoice: 'sg-1', reason: '2', payments: [{ value: 8330 }] });
  });

  it('reports a document awaiting the authority, and a rejection with its reasons', async () => {
    const { fetchFn } = siigo({
      ...AUTH,
      'GET /v1/invoices/sg-1': [
        { status: 200, body: { id: 'sg-1', name: 'FV-2-22', stamp: { status: 'Draft' } } },
        { status: 200, body: { id: 'sg-1', name: 'FV-2-22', stamp: { status: 'Rejected' } } },
      ],
      'GET /v1/invoices/sg-1/stamp/errors': () => ({ status: 200, body: [{ Message: 'NIT del adquiriente inválido' }] }),
    });
    const provider = new SiigoInvoicingProvider('https://api.siigo.com', fetchFn, () => NOW);
    const sent = doc().bindProvider('siigo', {}, NOW).markAwaiting({ id: 'sg-1', number: 'FV-2-22', cufe: null }, NOW, NOW);

    expect(await provider.getStatus(sent, CONTEXT)).toMatchObject({ status: 'awaiting' });
    expect(await provider.getStatus(sent, CONTEXT)).toMatchObject({ status: 'rejected', errors: ['NIT del adquiriente inválido'] });
  });

  it.each<[string, { status: number; body?: unknown }, 'transient' | 'rejected']>([
    ['a server error', { status: 503 }, 'transient'],
    ['a rate limit', { status: 429 }, 'transient'],
    ['a validation error', { status: 400, body: { Errors: [{ Code: 'invalid_item', Message: 'El producto no existe' }] } }, 'rejected'],
  ])('classifies %s', async (_label, answer, kind) => {
    const { fetchFn } = siigo({ ...AUTH, ...NO_CUSTOMER, ...CREATE_CUSTOMER, 'POST /v1/invoices': () => answer });

    const error = await new SiigoInvoicingProvider('https://api.siigo.com', fetchFn, () => NOW).createInvoice(doc(), BUYER, CONTEXT).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InvoicingProviderError);
    expect((error as InvoicingProviderError).kind).toBe(kind);
    if (kind === 'rejected') expect((error as Error).message).toContain('El producto no existe');
  });

  it('treats a network failure and bad credentials as transient, never echoing a secret', async () => {
    const down = vi.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
    const { fetchFn: refused } = siigo({ 'POST /auth': () => ({ status: 401, body: { Errors: [{ Message: 'Invalid access key secret-access-key' }] } }) });

    for (const fetchFn of [down, refused]) {
      const error = await new SiigoInvoicingProvider('https://api.siigo.com', fetchFn, () => NOW).createInvoice(doc(), BUYER, CONTEXT).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ kind: 'transient' });
      expect(String((error as Error).message)).not.toContain('secret-access-key');
    }
  });

  it('re-authenticates once when the token is refused', async () => {
    const { fetchFn, calls } = siigo({
      'POST /auth': [
        { status: 201, body: { access_token: 'tok-old', expires_in: 86400 } },
        { status: 201, body: { access_token: 'tok-new', expires_in: 86400 } },
      ],
      'GET /v1/customers?identification=1020304050': [{ status: 401 }, { status: 200, body: { results: [] } }],
      ...CREATE_CUSTOMER,
      'POST /v1/invoices': () => ({ status: 201, body: accepted }),
    });

    await new SiigoInvoicingProvider('https://api.siigo.com', fetchFn, () => NOW).createInvoice(doc(), BUYER, CONTEXT);

    expect(calls.at(-1)!.headers).toMatchObject({ Authorization: 'Bearer tok-new' });
  });

  it('refuses a buyer the authority would reject, before calling Siigo', async () => {
    const { fetchFn } = siigo({ ...AUTH });
    const provider = new SiigoInvoicingProvider('https://api.siigo.com', fetchFn, () => NOW);

    await expect(provider.createInvoice(doc(), { ...BUYER, cityCode: null }, CONTEXT)).rejects.toMatchObject({ kind: 'rejected', code: 'buyer_city_not_coded' });
    await expect(provider.createInvoice(doc(), { ...BUYER, documentType: 'XX' }, CONTEXT)).rejects.toMatchObject({
      kind: 'rejected',
      code: 'buyer_document_type_unsupported',
    });
  });

  it('decodes the PDF, and answers null when the XML does not exist', async () => {
    const { fetchFn } = siigo({
      ...AUTH,
      'GET /v1/invoices/sg-1/pdf': () => ({ status: 200, body: { id: 'sg-1', base64: Buffer.from('%PDF-1.4').toString('base64') } }),
      'GET /v1/invoices/sg-1/xml': () => ({ status: 404 }),
    });
    const provider = new SiigoInvoicingProvider('https://api.siigo.com', fetchFn, () => NOW);
    const issued = doc().bindProvider('siigo', {}, NOW).markIssued({ id: 'sg-1', number: 'FV-2-22', cufe: 'c' }, NOW);

    expect(await provider.getFile(issued, 'pdf', CONTEXT)).toEqual({ contentType: 'application/pdf', fileName: 'FV-2-22.pdf', content: Buffer.from('%PDF-1.4') });
    expect(await provider.getFile(issued, 'xml', CONTEXT)).toBeNull();
  });
});

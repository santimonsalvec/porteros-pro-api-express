import {
  InvoicingProviderError,
  type IInvoicingProvider,
  type ProviderBuyer,
  type ProviderContext,
  type ProviderDocumentResult,
  type ProviderFile,
} from '../../application/features/invoicing/common/ports.js';
import type { InvoicingDocument } from '../../domain/invoicing/invoicingDocument.js';
import type { SiigoConfig } from '../../domain/invoicing/invoicingSettings.js';

const TIMEOUT_MS = 15_000;
/** Renew the 24-hour token this long before it expires. */
const TOKEN_MARGIN_MS = 10 * 60_000;

/** Siigo's `id_type` for our document types (research.md §6). */
const ID_TYPES: Record<string, string> = {
  cedula_ciudadania: '13',
  CC: '13',
  cedula_extranjeria: '22',
  CE: '22',
  pasaporte: '41',
  PA: '41',
  nit: '31',
  NIT: '31',
};

interface SiigoResponse {
  status: number;
  body: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The messages of Siigo's `{ Errors: [{ Code, Message }] }` answer, or of a plain list. */
function errorMessages(body: unknown): string[] {
  const list = isRecord(body) && Array.isArray(body.Errors) ? body.Errors : Array.isArray(body) ? body : [];
  return list
    .map((item) => (isRecord(item) ? (item.Message ?? item.message ?? item.Code ?? item.code) : item))
    .filter((message): message is string => typeof message === 'string' && message !== '');
}

/** Today in Colombia, as Siigo expects it (an electronic invoice can't be dated before today). */
function bogotaDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function siigoConfig(context: ProviderContext): SiigoConfig {
  return context.config as unknown as SiigoConfig;
}

/**
 * Siigo (Colombia) over its REST API (research.md §1): customers, invoices and credit notes sent
 * to the DIAN (`stamp`) and emailed to the buyer (`mail`), status re-reads and files. Every
 * identifier comes from the country's settings and the credentials from its secrets; neither is
 * ever put in an error. Creation carries an `Idempotency-Key`, so a retry after a lost answer
 * returns the document already created.
 */
export class SiigoInvoicingProvider implements IInvoicingProvider {
  readonly name = 'siigo';
  private readonly tokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createInvoice(document: InvoicingDocument, buyer: ProviderBuyer, context: ProviderContext): Promise<ProviderDocumentResult> {
    const config = siigoConfig(context);
    await this.ensureCustomer(buyer, context);
    const response = await this.request(context, 'POST', '/v1/invoices', this.documentBody(document, buyer, config, config.invoiceDocumentId), {
      'Idempotency-Key': document.idempotencyKey(),
    });
    return this.result(context, 'invoices', response);
  }

  async createCreditNote(
    document: InvoicingDocument,
    original: InvoicingDocument,
    buyer: ProviderBuyer,
    context: ProviderContext,
  ): Promise<ProviderDocumentResult> {
    if (!original.provider?.id) throw new InvoicingProviderError('transient', 'original_not_issued', 'The original invoice has no provider id yet');
    const config = siigoConfig(context);
    await this.ensureCustomer(buyer, context);
    const body = {
      ...this.documentBody(document, buyer, config, config.creditNoteDocumentId),
      invoice: original.provider.id,
      // Anulación: the whole charge was given back.
      reason: '2',
    };
    const response = await this.request(context, 'POST', '/v1/credit-notes', body, { 'Idempotency-Key': document.idempotencyKey() });
    return this.result(context, 'credit-notes', response);
  }

  async getStatus(document: InvoicingDocument, context: ProviderContext): Promise<ProviderDocumentResult> {
    const id = document.provider?.id;
    if (!id) throw new InvoicingProviderError('transient', 'not_sent', 'The document was never created at the provider');
    const response = await this.request(context, 'GET', `/v1/${this.path(document)}/${encodeURIComponent(id)}`);
    return this.result(context, this.path(document), response);
  }

  async getFile(document: InvoicingDocument, kind: 'pdf' | 'xml', context: ProviderContext): Promise<ProviderFile | null> {
    const id = document.provider?.id;
    if (!id) return null;
    const response = await this.request(context, 'GET', `/v1/${this.path(document)}/${encodeURIComponent(id)}/${kind}`, undefined, {}, true);
    if (response.status === 404) return null;
    const base64 = isRecord(response.body) ? (response.body.base64 ?? response.body.file ?? response.body.content) : null;
    if (typeof base64 !== 'string' || base64 === '') return null;
    const name = (document.provider?.number ?? document.id).replace(/[^\w.-]/g, '_');
    return {
      contentType: kind === 'pdf' ? 'application/pdf' : 'application/xml',
      fileName: `${name}.${kind}`,
      content: Buffer.from(base64, 'base64'),
    };
  }

  /** Creates the buyer in Siigo, or updates the name and email of an existing one. */
  private async ensureCustomer(buyer: ProviderBuyer, context: ProviderContext): Promise<void> {
    const idType = ID_TYPES[buyer.documentType];
    if (!idType) throw new InvoicingProviderError('rejected', 'buyer_document_type_unsupported', `Document type ${buyer.documentType} is not supported`);
    if (!buyer.stateCode || !buyer.cityCode) {
      throw new InvoicingProviderError('rejected', 'buyer_city_not_coded', `City ${buyer.cityId} has no DANE codes`);
    }
    const customer = {
      type: 'Customer',
      person_type: 'Person',
      id_type: idType,
      identification: buyer.documentNumber,
      name: [buyer.firstName, buyer.lastName],
      vat_responsible: false,
      fiscal_responsibilities: [{ code: 'R-99-PN' }],
      address: {
        address: buyer.cityName ?? buyer.cityId,
        city: { country_code: buyer.countryCode, state_code: buyer.stateCode, city_code: buyer.cityCode },
      },
      contacts: [{ first_name: buyer.firstName, last_name: buyer.lastName, email: buyer.email }],
    };
    const found = await this.request(context, 'GET', `/v1/customers?identification=${encodeURIComponent(buyer.documentNumber)}`);
    const results = isRecord(found.body) && Array.isArray(found.body.results) ? found.body.results.filter(isRecord) : [];
    const existing = results[0];
    if (!existing) {
      await this.request(context, 'POST', '/v1/customers', customer);
      return;
    }
    const contacts = Array.isArray(existing.contacts) ? existing.contacts.filter(isRecord) : [];
    const names = Array.isArray(existing.name) ? existing.name : [];
    const same = names[0] === buyer.firstName && names[1] === buyer.lastName && contacts[0]?.email === buyer.email;
    if (!same && typeof existing.id === 'string') await this.request(context, 'PUT', `/v1/customers/${encodeURIComponent(existing.id)}`, customer);
  }

  private documentBody(document: InvoicingDocument, buyer: ProviderBuyer, config: SiigoConfig, documentTypeId: number) {
    const date = bogotaDate(this.now());
    const description = document.concept === 'commission' ? 'Comisión por servicio de portero' : 'Penalidad por incumplimiento';
    return {
      document: { id: documentTypeId },
      date,
      customer: { identification: buyer.documentNumber, branch_office: 0 },
      seller: config.sellerId,
      observations: document.bookingId ? `Reserva ${document.bookingId}` : undefined,
      items: [
        {
          code: document.concept === 'commission' ? config.commissionProductCode : config.penaltyProductCode,
          description,
          quantity: 1,
          price: document.base,
          discount: 0,
          taxes: document.vat > 0 ? [{ id: config.vatTaxId }] : [],
        },
      ],
      payments: [{ id: config.paymentMethodId, value: document.total, due_date: date }],
      stamp: { send: true },
      mail: { send: true },
    };
  }

  private path(document: InvoicingDocument): 'invoices' | 'credit-notes' {
    return document.kind === 'invoice' ? 'invoices' : 'credit-notes';
  }

  /** Maps Siigo's document to a result; a rejection carries the authority's reasons. */
  private async result(context: ProviderContext, path: 'invoices' | 'credit-notes', response: SiigoResponse): Promise<ProviderDocumentResult> {
    const body = isRecord(response.body) ? response.body : {};
    const id = typeof body.id === 'string' ? body.id : null;
    if (!id) throw new InvoicingProviderError('transient', 'provider_bad_answer', 'Siigo answered without a document id');
    const stamp = isRecord(body.stamp) ? body.stamp : {};
    const number = typeof body.name === 'string' ? body.name : null;
    const cufe = typeof stamp.cufe === 'string' && stamp.cufe !== '' ? stamp.cufe : null;
    if (stamp.status === 'Accepted') return { id, number, cufe, status: 'accepted' };
    if (stamp.status === 'Rejected') {
      const errors = await this.request(context, 'GET', `/v1/${path}/${encodeURIComponent(id)}/stamp/errors`, undefined, {}, true)
        .then((answer) => errorMessages(answer.body))
        .catch(() => []);
      const observations = typeof stamp.observations === 'string' && stamp.observations !== '' ? [stamp.observations] : [];
      return { id, number, cufe, status: 'rejected', errors: errors.length > 0 ? errors : observations };
    }
    return { id, number, cufe, status: 'awaiting' };
  }

  private async token(context: ProviderContext, renew: boolean): Promise<string> {
    const key = `${context.countryCode}:${context.credentials.username}`;
    const cached = this.tokens.get(key);
    if (!renew && cached && cached.expiresAt - TOKEN_MARGIN_MS > this.now().getTime()) return cached.token;
    const response = await this.send('POST', '/auth', { username: context.credentials.username, access_key: context.credentials.accessKey }, {
      'Partner-Id': siigoConfig(context).partnerId,
    });
    const body = isRecord(response.body) ? response.body : {};
    if (response.status >= 400 || typeof body.access_token !== 'string') {
      // Wrong credentials are fixed by an operator; the document waits meanwhile.
      throw new InvoicingProviderError('transient', 'provider_auth_failed', `Siigo authentication answered ${response.status}`);
    }
    const lifetime = typeof body.expires_in === 'number' ? body.expires_in * 1000 : 24 * 60 * 60_000;
    this.tokens.set(key, { token: body.access_token, expiresAt: this.now().getTime() + lifetime });
    return body.access_token;
  }

  /** An authenticated call: renews the token once on a 401, and classifies failures. */
  private async request(
    context: ProviderContext,
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
    allowNotFound = false,
  ): Promise<SiigoResponse> {
    let response: SiigoResponse | null = null;
    for (const renew of [false, true]) {
      const token = await this.token(context, renew);
      response = await this.send(method, path, body, { ...headers, Authorization: `Bearer ${token}`, 'Partner-Id': siigoConfig(context).partnerId });
      if (response.status !== 401) break;
    }
    const { status } = response!;
    if (status === 401) throw new InvoicingProviderError('transient', 'provider_auth_failed', 'Siigo refused the token');
    if (status === 404 && allowNotFound) return response!;
    if (status === 429 || status >= 500) throw new InvoicingProviderError('transient', `provider_error_${status}`, `Siigo answered ${status}`);
    if (status >= 400) {
      const messages = errorMessages(response!.body);
      throw new InvoicingProviderError('rejected', 'provider_validation', messages.length > 0 ? messages.join('; ') : `Siigo answered ${status}`);
    }
    return response!;
  }

  private async send(method: string, path: string, body: unknown, headers: Record<string, string>): Promise<SiigoResponse> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl.replace(/\/+$/, '')}${path}`, {
        method,
        headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new InvoicingProviderError('transient', 'provider_unreachable', `Siigo unreachable: ${error instanceof Error ? error.name : 'unknown'}`);
    }
    const text = await response.text().catch(() => '');
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed };
  }
}

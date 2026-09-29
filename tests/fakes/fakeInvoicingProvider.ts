import {
  InvoicingProviderError,
  type IInvoicingProvider,
  type IInvoicingProviderRegistry,
  type ProviderBuyer,
  type ProviderContext,
  type ProviderDocumentResult,
  type ProviderFile,
} from '../../src/application/features/invoicing/common/ports.js';
import type { InvoicingDocument } from '../../src/domain/invoicing/invoicingDocument.js';

/**
 * What the next creation or status read does:
 * - `accepted`, `awaiting`, `rejected`: the authority's answer;
 * - `invalid`: the provider refuses the data (a 400);
 * - `transient`: the provider is down;
 * - `lost_answer`: the document is created, but the answer never arrives (thrown as transient);
 *   a retry with the same idempotency key gets it back, as with Siigo.
 */
export type FakeOutcome = 'accepted' | 'awaiting' | 'rejected' | 'invalid' | 'transient' | 'lost_answer';

export interface FakeProviderCall {
  operation: 'invoice' | 'credit_note' | 'status' | 'file';
  documentId: string;
  idempotencyKey?: string;
  buyer?: ProviderBuyer;
  context: ProviderContext;
  originalProviderId?: string;
}

/** An invoicing provider that never leaves the process, with scripted answers (default: accepted). */
export class FakeInvoicingProvider implements IInvoicingProvider {
  readonly calls: FakeProviderCall[] = [];
  /** Documents the provider holds, by idempotency key. */
  readonly created = new Map<string, ProviderDocumentResult>();
  readonly files = new Map<string, ProviderFile>();
  private readonly outcomes: FakeOutcome[] = [];
  private counter = 0;

  constructor(readonly name = 'siigo') {}

  /** The next answers, in order; then `accepted`. */
  script(...outcomes: FakeOutcome[]): void {
    this.outcomes.push(...outcomes);
  }

  invoices(): FakeProviderCall[] {
    return this.calls.filter((call) => call.operation === 'invoice');
  }

  creditNotes(): FakeProviderCall[] {
    return this.calls.filter((call) => call.operation === 'credit_note');
  }

  async createInvoice(document: InvoicingDocument, buyer: ProviderBuyer, context: ProviderContext): Promise<ProviderDocumentResult> {
    this.calls.push({ operation: 'invoice', documentId: document.id, idempotencyKey: document.idempotencyKey(), buyer, context });
    return this.create(document, 'FV');
  }

  async createCreditNote(
    document: InvoicingDocument,
    original: InvoicingDocument,
    buyer: ProviderBuyer,
    context: ProviderContext,
  ): Promise<ProviderDocumentResult> {
    this.calls.push({
      operation: 'credit_note',
      documentId: document.id,
      idempotencyKey: document.idempotencyKey(),
      buyer,
      context,
      originalProviderId: original.provider?.id ?? undefined,
    });
    return this.create(document, 'NC');
  }

  async getStatus(document: InvoicingDocument, context: ProviderContext): Promise<ProviderDocumentResult> {
    this.calls.push({ operation: 'status', documentId: document.id, context });
    const known = this.created.get(document.idempotencyKey());
    if (!known) throw new InvoicingProviderError('transient', 'unknown_document', 'not created');
    return this.answer(known);
  }

  async getFile(document: InvoicingDocument, kind: 'pdf' | 'xml', context: ProviderContext): Promise<ProviderFile | null> {
    this.calls.push({ operation: 'file', documentId: document.id, context });
    const next = this.outcomes[0];
    if (next === 'transient') {
      this.outcomes.shift();
      throw new InvoicingProviderError('transient', 'provider_down', 'fake provider down');
    }
    return this.files.get(`${document.provider?.id}:${kind}`) ?? null;
  }

  private create(document: InvoicingDocument, prefix: string): ProviderDocumentResult {
    const key = document.idempotencyKey();
    const existing = this.created.get(key);
    // Same idempotency key: the provider answers the document it already has.
    if (existing) return existing;
    const outcome = this.outcomes.shift() ?? 'accepted';
    if (outcome === 'transient') throw new InvoicingProviderError('transient', 'provider_down', 'fake provider down');
    if (outcome === 'invalid') throw new InvoicingProviderError('rejected', 'provider_validation', 'fake validation error');
    this.counter += 1;
    const status = outcome === 'awaiting' ? 'awaiting' : outcome === 'rejected' ? 'rejected' : 'accepted';
    const result: ProviderDocumentResult = {
      id: `fake-${this.counter}`,
      number: `${prefix}-1-${this.counter}`,
      cufe: status === 'accepted' ? `cufe-${this.counter}` : null,
      status,
      ...(status === 'rejected' ? { errors: ['fake authority rejection'] } : {}),
    };
    this.created.set(key, status === 'awaiting' ? result : { ...result });
    if (outcome === 'lost_answer') {
      this.created.set(key, { ...result, status: 'accepted', cufe: `cufe-${this.counter}` });
      throw new InvoicingProviderError('transient', 'provider_timeout', 'fake answer lost');
    }
    return result;
  }

  /** A status read: a scripted outcome can move an awaiting document on. */
  private answer(known: ProviderDocumentResult): ProviderDocumentResult {
    if (known.status !== 'awaiting') return known;
    const outcome = this.outcomes.shift() ?? 'accepted';
    if (outcome === 'transient') throw new InvoicingProviderError('transient', 'provider_down', 'fake provider down');
    if (outcome === 'awaiting') return known;
    return outcome === 'rejected'
      ? { ...known, status: 'rejected', errors: ['fake authority rejection'] }
      : { ...known, status: 'accepted', cufe: `cufe-${known.id}` };
  }
}

export class FakeInvoicingProviderRegistry implements IInvoicingProviderRegistry {
  constructor(private readonly providers: IInvoicingProvider[]) {}

  get(name: string): IInvoicingProvider | null {
    return this.providers.find((provider) => provider.name === name) ?? null;
  }
}

import { Entity } from '../common/entity.js';

export type InvoicingDocumentKind = 'invoice' | 'credit_note';
export type InvoicingConcept = 'commission' | 'penalty';
export type InvoicingDocumentStatus = 'pending' | 'awaiting_authority' | 'issued' | 'rejected';

/** Who the document is addressed to, as it was when it was created (research.md §5). */
export interface InvoicingBuyer {
  documentType: string;
  documentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  cityId: string;
}

/**
 * Set the first time the document reaches a provider; never changes afterwards (research.md §10).
 * It keeps the provider's non-secret configuration it was sent with, so retries, status reads,
 * files and credit notes keep working after the country switches provider.
 */
export interface ProviderBinding {
  name: string;
  config: Readonly<Record<string, unknown>>;
  id: string | null;
  number: string | null;
  cufe: string | null;
}

export interface InvoicingError {
  kind: 'transient' | 'rejected';
  code: string;
  message: string;
  at: Date;
}

export interface InvoicingDocumentProps {
  id: string;
  kind: InvoicingDocumentKind;
  concept: InvoicingConcept;
  goalkeeperId: string;
  countryId: string;
  sourceEventId: string | null;
  sourceMovementId: string;
  vatMovementId: string | null;
  bookingId: string | null;
  requestId: string | null;
  originalDocumentId: string | null;
  base: number;
  vat: number;
  total: number;
  vatRateBps: number;
  currency: string;
  buyer: InvoicingBuyer;
  status: InvoicingDocumentStatus;
  waitingFor: string | null;
  provider: ProviderBinding | null;
  attempts: number;
  nextAttemptAt: Date | null;
  lastError: InvoicingError | null;
  occurredAt: Date;
  createdAt: Date;
  issuedAt: Date | null;
  updatedAt: Date;
}

const STALE_MS = 24 * 60 * 60_000;

/**
 * An invoice (for a commission or penalty charged) or a credit note (for one given back), sent to
 * the tax authority through the country's invoicing provider (feature 023). One per billable
 * movement. Each change returns a new document; the repository writes it conditionally.
 */
export class InvoicingDocument extends Entity<string> {
  readonly kind: InvoicingDocumentKind;
  readonly concept: InvoicingConcept;
  readonly goalkeeperId: string;
  readonly countryId: string;
  readonly sourceEventId: string | null;
  readonly sourceMovementId: string;
  readonly vatMovementId: string | null;
  readonly bookingId: string | null;
  readonly requestId: string | null;
  readonly originalDocumentId: string | null;
  readonly base: number;
  readonly vat: number;
  readonly total: number;
  readonly vatRateBps: number;
  readonly currency: string;
  readonly buyer: InvoicingBuyer;
  readonly status: InvoicingDocumentStatus;
  readonly waitingFor: string | null;
  readonly provider: ProviderBinding | null;
  readonly attempts: number;
  readonly nextAttemptAt: Date | null;
  readonly lastError: InvoicingError | null;
  readonly occurredAt: Date;
  readonly createdAt: Date;
  readonly issuedAt: Date | null;
  readonly updatedAt: Date;

  private constructor(props: InvoicingDocumentProps) {
    super(props.id);
    if (!Number.isInteger(props.base) || props.base <= 0) throw new Error('InvoicingDocument: base must be a positive integer');
    if (!Number.isInteger(props.vat) || props.vat < 0) throw new Error('InvoicingDocument: vat must be a non-negative integer');
    if (props.total !== props.base + props.vat) throw new Error('InvoicingDocument: total must be base + vat');
    if ((props.kind === 'credit_note') !== (props.originalDocumentId !== null)) {
      throw new Error('InvoicingDocument: a credit note, and only a credit note, references its original');
    }
    this.kind = props.kind;
    this.concept = props.concept;
    this.goalkeeperId = props.goalkeeperId;
    this.countryId = props.countryId;
    this.sourceEventId = props.sourceEventId;
    this.sourceMovementId = props.sourceMovementId;
    this.vatMovementId = props.vatMovementId;
    this.bookingId = props.bookingId;
    this.requestId = props.requestId;
    this.originalDocumentId = props.originalDocumentId;
    this.base = props.base;
    this.vat = props.vat;
    this.total = props.total;
    this.vatRateBps = props.vatRateBps;
    this.currency = props.currency;
    this.buyer = { ...props.buyer };
    this.status = props.status;
    this.waitingFor = props.waitingFor;
    this.provider = props.provider ? { ...props.provider, config: { ...props.provider.config } } : null;
    this.attempts = props.attempts;
    this.nextAttemptAt = props.nextAttemptAt ? new Date(props.nextAttemptAt) : null;
    this.lastError = props.lastError ? { ...props.lastError, at: new Date(props.lastError.at) } : null;
    this.occurredAt = new Date(props.occurredAt);
    this.createdAt = new Date(props.createdAt);
    this.issuedAt = props.issuedAt ? new Date(props.issuedAt) : null;
    this.updatedAt = new Date(props.updatedAt);
  }

  static rehydrate(props: InvoicingDocumentProps): InvoicingDocument {
    return new InvoicingDocument(props);
  }

  /** A new pending document, due at once. */
  static create(
    props: Omit<InvoicingDocumentProps, 'status' | 'waitingFor' | 'provider' | 'attempts' | 'nextAttemptAt' | 'lastError' | 'issuedAt' | 'updatedAt' | 'total'>,
  ): InvoicingDocument {
    return new InvoicingDocument({
      ...props,
      total: props.base + props.vat,
      status: 'pending',
      waitingFor: props.originalDocumentId,
      provider: null,
      attempts: 0,
      nextAttemptAt: props.createdAt,
      lastError: null,
      issuedAt: null,
      updatedAt: props.createdAt,
    });
  }

  toProps(): InvoicingDocumentProps {
    return {
      id: this.id,
      kind: this.kind,
      concept: this.concept,
      goalkeeperId: this.goalkeeperId,
      countryId: this.countryId,
      sourceEventId: this.sourceEventId,
      sourceMovementId: this.sourceMovementId,
      vatMovementId: this.vatMovementId,
      bookingId: this.bookingId,
      requestId: this.requestId,
      originalDocumentId: this.originalDocumentId,
      base: this.base,
      vat: this.vat,
      total: this.total,
      vatRateBps: this.vatRateBps,
      currency: this.currency,
      buyer: { ...this.buyer },
      status: this.status,
      waitingFor: this.waitingFor,
      provider: this.provider ? { ...this.provider } : null,
      attempts: this.attempts,
      nextAttemptAt: this.nextAttemptAt,
      lastError: this.lastError,
      occurredAt: this.occurredAt,
      createdAt: this.createdAt,
      issuedAt: this.issuedAt,
      updatedAt: this.updatedAt,
    };
  }

  private with(changes: Partial<InvoicingDocumentProps>, now: Date): InvoicingDocument {
    return new InvoicingDocument({ ...this.toProps(), ...changes, updatedAt: now });
  }

  /** The provider's alphanumeric idempotency key (≤ 30 characters): the id as base 36. */
  idempotencyKey(): string {
    return BigInt(`0x${this.id.replace(/-/g, '')}`).toString(36);
  }

  isFinal(): boolean {
    return this.status === 'issued' || this.status === 'rejected';
  }

  /** Pending or awaiting the authority for more than 24 hours (FR-010). */
  isStale(now: Date): boolean {
    return !this.isFinal() && now.getTime() - this.createdAt.getTime() > STALE_MS;
  }

  /** The provider (and its configuration) this document is sent to, fixed the first time. */
  bindProvider(name: string, config: Readonly<Record<string, unknown>>, now: Date): InvoicingDocument {
    if (this.provider) {
      if (this.provider.name !== name) throw new Error(`InvoicingDocument ${this.id} is bound to ${this.provider.name}`);
      return this;
    }
    return this.with({ provider: { name, config: { ...config }, id: null, number: null, cufe: null } }, now);
  }

  /** A credit note waiting for its original to be issued: re-checked every run. */
  markWaiting(now: Date, nextAt: Date): InvoicingDocument {
    return this.with({ waitingFor: this.originalDocumentId, nextAttemptAt: nextAt }, now);
  }

  markIssued(ref: { id: string; number: string | null; cufe: string | null }, now: Date): InvoicingDocument {
    return this.with(
      { status: 'issued', provider: { ...this.bound(), ...ref }, issuedAt: now, nextAttemptAt: null, waitingFor: null, lastError: null },
      now,
    );
  }

  markAwaiting(ref: { id: string; number: string | null; cufe: string | null }, now: Date, nextAt: Date): InvoicingDocument {
    return this.with({ status: 'awaiting_authority', provider: { ...this.bound(), ...ref }, nextAttemptAt: nextAt, waitingFor: null }, now);
  }

  markRejected(error: { code: string; message: string }, now: Date, ref?: { id: string; number: string | null; cufe: string | null }): InvoicingDocument {
    return this.with(
      {
        status: 'rejected',
        ...(ref ? { provider: { ...this.bound(), ...ref } } : {}),
        nextAttemptAt: null,
        lastError: { kind: 'rejected', ...error, at: now },
      },
      now,
    );
  }

  /** A failure worth retrying: attempts + 1 and the next attempt per the schedule. */
  markTransient(error: { code: string; message: string }, now: Date, nextAt: Date): InvoicingDocument {
    return this.with({ attempts: this.attempts + 1, nextAttemptAt: nextAt, lastError: { kind: 'transient', ...error, at: now } }, now);
  }

  /** An administrator's retry of a rejected document, with the buyer's current data. */
  resetForRetry(buyer: InvoicingBuyer, now: Date): InvoicingDocument {
    if (this.status !== 'rejected') throw new Error(`InvoicingDocument ${this.id} is not rejected`);
    return this.with({ status: 'pending', buyer, attempts: 0, nextAttemptAt: now, lastError: null }, now);
  }

  private bound(): ProviderBinding {
    if (!this.provider) throw new Error(`InvoicingDocument ${this.id} was never sent to a provider`);
    return this.provider;
  }
}

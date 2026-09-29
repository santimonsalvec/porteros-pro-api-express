import type {
  InvoicingBuyer,
  InvoicingDocument,
  InvoicingDocumentStatus,
} from '../../../../domain/invoicing/invoicingDocument.js';
import type { InvoicingSettings } from '../../../../domain/invoicing/invoicingSettings.js';
import type { BillableMovementType } from '../../../../domain/wallet/walletMovement.js';

/** A provider's credentials for one country, from the environment (Secret Manager). Never stored or logged. */
export interface InvoicingCredentials {
  username: string;
  accessKey: string;
}

/** The buyer as a provider needs it: the snapshot plus the city's data (name, official codes). */
export interface ProviderBuyer extends InvoicingBuyer {
  cityName: string | null;
  /** DANE codes in Colombia; each provider adapter uses what its country requires. */
  stateCode: string | null;
  cityCode: string | null;
  countryCode: string;
}

/** Everything a provider call needs about the country: its settings, credentials and code. */
export interface ProviderContext {
  countryCode: string;
  config: Readonly<Record<string, unknown>>;
  credentials: InvoicingCredentials;
}

/** What the provider says about a document it created. */
export interface ProviderDocumentResult {
  id: string;
  number: string | null;
  cufe: string | null;
  status: 'accepted' | 'awaiting' | 'rejected';
  /** Why the authority rejected it, when it did. */
  errors?: string[];
}

export interface ProviderFile {
  contentType: string;
  fileName: string;
  content: Buffer;
}

/** A provider failure, classified: `transient` is retried, `rejected` waits for an administrator. Never carries a secret. */
export class InvoicingProviderError extends Error {
  constructor(
    readonly kind: 'transient' | 'rejected',
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'InvoicingProviderError';
  }
}

/** One electronic-invoicing provider (Siigo first). Every call to it goes through here (FR-012). */
export interface IInvoicingProvider {
  readonly name: string;
  createInvoice(document: InvoicingDocument, buyer: ProviderBuyer, context: ProviderContext): Promise<ProviderDocumentResult>;
  createCreditNote(document: InvoicingDocument, original: InvoicingDocument, buyer: ProviderBuyer, context: ProviderContext): Promise<ProviderDocumentResult>;
  getStatus(document: InvoicingDocument, context: ProviderContext): Promise<ProviderDocumentResult>;
  /** `null` when the provider has no such file. */
  getFile(document: InvoicingDocument, kind: 'pdf' | 'xml', context: ProviderContext): Promise<ProviderFile | null>;
}

export interface IInvoicingProviderRegistry {
  get(name: string): IInvoicingProvider | null;
}

export interface IInvoicingSecrets {
  /** `null` when any credential is missing for that provider and country. */
  forProvider(provider: string, countryCode: string): InvoicingCredentials | null;
}

export interface IInvoicingSettingsRepository {
  getByCountry(countryId: string): Promise<InvoicingSettings | null>;
  save(settings: InvoicingSettings): Promise<void>;
}

export interface IInvoicingDocumentRepository {
  /** Creates the document unless one exists for its source movement; answers the one that exists. */
  createIfAbsent(document: InvoicingDocument): Promise<{ created: boolean; document: InvoicingDocument }>;
  getById(id: string): Promise<InvoicingDocument | null>;
  findBySourceMovementId(movementId: string): Promise<InvoicingDocument | null>;
  /** Newest first by the charge's date. */
  listForGoalkeeper(goalkeeperId: string, skip: number, limit: number): Promise<InvoicingDocument[]>;
  countForGoalkeeper(goalkeeperId: string): Promise<number>;
  /** Oldest first; all statuses when `status` is null. */
  listByStatus(status: InvoicingDocumentStatus | null, skip: number, limit: number): Promise<InvoicingDocument[]>;
  countByStatus(status: InvoicingDocumentStatus | null): Promise<number>;
  /** Pending documents whose next attempt is due. */
  findDue(now: Date, cap: number): Promise<InvoicingDocument[]>;
  /** Documents the provider created that still wait for the authority, due for a re-read. */
  findAwaiting(now: Date, cap: number): Promise<InvoicingDocument[]>;
  /** Pending or awaiting documents created before `before`. */
  countStale(before: Date): Promise<number>;
  /** Writes the document only if it still has `expectedStatus`; false when it changed meanwhile. */
  update(document: InvoicingDocument, expectedStatus: InvoicingDocumentStatus): Promise<boolean>;
}

/** A billable ledger movement, as the safety net finds it. */
export interface BillableMovementRef {
  movementId: string;
  type: BillableMovementType;
}

export interface IBillableMovementScanner {
  /** Billable movements older than `olderThan` (and at most 7 days old) that have no document. */
  findWithoutDocument(olderThan: Date, cap: number): Promise<BillableMovementRef[]>;
}

/** The logging invoicing needs, so the application never imports pino. Never given a secret. */
export interface IInvoicingLogger {
  info(entry: Record<string, unknown>, message: string): void;
  warn(entry: Record<string, unknown>, message: string): void;
}

import type { GatewayEnvironment, GatewayName, PaymentGatewaySettings } from '../../../../domain/payments/gatewaySettings.js';
import type { Deposit, DepositCheck, DepositStatus } from '../../../../domain/deposits/deposit.js';
import type { LedgerOwner } from '../../operatingBalance/common/operatingBalanceLedger.js';

/** A gateway's secrets for one country. Read from the environment (Secret Manager), never stored. */
export interface GatewaySecrets {
  privateKey: string;
  eventsSecret: string;
  integritySecret: string;
}

export type GatewayTransactionStatus = 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';

/** What the gateway says about a payment, once its authenticity is established. */
export interface GatewayOutcome {
  reference: string;
  transactionId: string;
  status: GatewayTransactionStatus;
  amountInCents: number;
  currency: string;
}

export interface GatewayCheckoutArgs {
  reference: string;
  amountInCents: number;
  currency: string;
  redirectUrl: string;
  publicKey: string;
  secrets: GatewaySecrets;
}

/** The gateway could not be reached or answered with an error; the caller retries later. */
export class GatewayUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayUnavailableError';
  }
}

/** One payment gateway (research.md §1–§3). Every call to the provider goes through here. */
export interface IPaymentGateway {
  readonly name: GatewayName;
  /** The hosted checkout address, signed with the integrity secret. */
  buildCheckout(args: GatewayCheckoutArgs): string;
  /** The reference an incoming event is about, before its authenticity is checked; `null` when unreadable. */
  parseEvent(body: unknown): { reference: string } | null;
  /** The outcome of a genuine event, or `null` when its signature does not match. */
  verifyEvent(body: unknown, headers: Record<string, string | undefined>, secrets: GatewaySecrets): GatewayOutcome | null;
  /** The newest transaction for a reference, `null` when none exists; throws `GatewayUnavailableError`. */
  findByReference(reference: string, environment: GatewayEnvironment, secrets: GatewaySecrets): Promise<GatewayOutcome | null>;
}

export interface IPaymentGatewayRegistry {
  get(name: string): IPaymentGateway | null;
}

export interface IPaymentSecrets {
  /** `null` when any of the gateway's secrets is missing for that country. */
  forGateway(gateway: GatewayName, countryCode: string): GatewaySecrets | null;
}

export interface IPaymentGatewaySettingsRepository {
  getByCountry(countryId: string): Promise<PaymentGatewaySettings | null>;
  /** A country's first settings; `stale` when it already has some (admin spec 007, FR-025). */
  create(settings: PaymentGatewaySettings): Promise<'saved' | 'stale'>;
  /** Writes only at `expectedRevision`; `stale` when someone else saved first. */
  update(settings: PaymentGatewaySettings, expectedRevision: number): Promise<'saved' | 'stale'>;
}

export interface IDepositRepository {
  create(deposit: Deposit): Promise<void>;
  getById(id: string): Promise<Deposit | null>;
  getByReference(reference: string): Promise<Deposit | null>;
  /** Newest first. */
  listForGoalkeeper(goalkeeperId: string, skip: number, limit: number): Promise<Deposit[]>;
  countForGoalkeeper(goalkeeperId: string): Promise<number>;
  /** The goalkeeper's deposits still waiting for the gateway (feature 029: they hold up a closure). */
  findPendingForGoalkeeper(goalkeeperId: string): Promise<Deposit[]>;
  /** Pending deposits whose next check is due, oldest first, at most `cap`. */
  findDueForCheck(now: Date, cap: number): Promise<Deposit[]>;
  /** Records an unfinished check; only while the deposit is still pending. */
  scheduleNextCheck(id: string, nextCheckAt: Date, now: Date): Promise<void>;
  /** Keeps one ask to the gateway on the deposit (admin spec 007, FR-005); never touches the schedule. */
  recordCheck(id: string, entry: DepositCheck): Promise<void>;
  /** Holds the deposit for one ask to the gateway; `false` when another is in flight (research §2). */
  acquireCheckLease(id: string, now: Date): Promise<boolean>;
  releaseCheckLease(id: string): Promise<void>;
}

export interface ApplyOutcomeArgs {
  depositId: string;
  status: Exclude<DepositStatus, 'pending'>;
  /** The gateway's own id, when it gave one. */
  gatewayTransactionId: string | null;
  /** What the gateway charged; checked against the deposit. `null` for an expiry, which has none. */
  charged: { amountInCents: number; currency: string } | null;
  /** The operating balance's owner, resolved by the caller (011's operating balance context). */
  owner: LedgerOwner;
  now: Date;
}

export type ApplyOutcomeResult =
  /** The status changed; an approval also credited the operating balance (`balance` is the new balance). */
  | { kind: 'applied'; deposit: Deposit; balance: number | null }
  /** The transition is not allowed (a repeat, or a final status already recorded); nothing changed. */
  | { kind: 'unchanged'; deposit: Deposit }
  /** The gateway's amount or currency differs from the deposit's; nothing was credited. */
  | { kind: 'mismatch'; deposit: Deposit }
  | { kind: 'not_found' };

/**
 * Applies a gateway outcome in one transaction (research.md §5): the status change and, for an
 * approval, the `deposit` credit and the `gateway_fee` debit, each at most once per deposit.
 */
export interface IDepositStore {
  applyOutcome(args: ApplyOutcomeArgs): Promise<ApplyOutcomeResult>;
}

/** The logging payments need, so the application never imports pino. Never given a secret. */
export interface IPaymentsLogger {
  info(entry: Record<string, unknown>, message: string): void;
  warn(entry: Record<string, unknown>, message: string): void;
}

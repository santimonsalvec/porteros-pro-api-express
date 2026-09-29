import type { GatewayEnvironment, GatewayName, PaymentGatewaySettings } from '../../../../domain/payments/gatewaySettings.js';
import type { TopUp, TopUpStatus } from '../../../../domain/payments/topUp.js';
import type { LedgerOwner } from '../../wallet/common/walletLedger.js';

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
  save(settings: PaymentGatewaySettings): Promise<void>;
}

export interface ITopUpRepository {
  create(topUp: TopUp): Promise<void>;
  getById(id: string): Promise<TopUp | null>;
  getByReference(reference: string): Promise<TopUp | null>;
  /** Newest first. */
  listForGoalkeeper(goalkeeperId: string, skip: number, limit: number): Promise<TopUp[]>;
  countForGoalkeeper(goalkeeperId: string): Promise<number>;
  /** Pending top-ups whose next check is due, oldest first, at most `cap`. */
  findDueForCheck(now: Date, cap: number): Promise<TopUp[]>;
  /** Records an unfinished check; only while the top-up is still pending. */
  scheduleNextCheck(id: string, nextCheckAt: Date, now: Date): Promise<void>;
}

export interface ApplyOutcomeArgs {
  topUpId: string;
  status: Exclude<TopUpStatus, 'pending'>;
  /** The gateway's own id, when it gave one. */
  gatewayTransactionId: string | null;
  /** What the gateway charged; checked against the top-up. `null` for an expiry, which has none. */
  charged: { amountInCents: number; currency: string } | null;
  /** The wallet's owner, resolved by the caller (011's wallet context). */
  owner: LedgerOwner;
  now: Date;
}

export type ApplyOutcomeResult =
  /** The status changed; an approval also credited the wallet (`balance` is the new balance). */
  | { kind: 'applied'; topUp: TopUp; balance: number | null }
  /** The transition is not allowed (a repeat, or a final status already recorded); nothing changed. */
  | { kind: 'unchanged'; topUp: TopUp }
  /** The gateway's amount or currency differs from the top-up's; nothing was credited. */
  | { kind: 'mismatch'; topUp: TopUp }
  | { kind: 'not_found' };

/**
 * Applies a gateway outcome in one transaction (research.md §5): the status change and, for an
 * approval, the `top_up` credit and the `gateway_fee` debit, each at most once per top-up.
 */
export interface ITopUpStore {
  applyOutcome(args: ApplyOutcomeArgs): Promise<ApplyOutcomeResult>;
}

/** The logging payments need, so the application never imports pino. Never given a secret. */
export interface IPaymentsLogger {
  info(entry: Record<string, unknown>, message: string): void;
  warn(entry: Record<string, unknown>, message: string): void;
}

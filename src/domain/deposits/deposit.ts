import { Entity } from '../common/entity.js';
import type { GatewayEnvironment, GatewayName } from '../payments/gatewaySettings.js';

export const DEPOSIT_STATUSES = ['pending', 'approved', 'declined', 'voided', 'error', 'expired'] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];
export type FinalDepositStatus = Exclude<DepositStatus, 'pending'>;

/** When a pending deposit is asked about, in minutes after its creation (research.md §6). */
export const RECONCILE_SCHEDULE_MINUTES = [15, 60, 360, 1440] as const;
/** A deposit still without a final answer this long after creation is expired. */
export const EXPIRY_MINUTES = 2880;

const MINUTE_MS = 60_000;

/** How many checks a deposit keeps, newest last (admin spec 007, research §1). */
export const CHECK_LOG_MAX = 50;
/** How long one ask to the gateway holds a deposit, so two are never in flight at once (research §2). */
export const CHECK_LEASE_SECONDS = 30;

/** What the gateway answered, or why it could not be asked. */
export type DepositCheckAnswer = 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING' | 'NOT_FOUND' | 'UNAVAILABLE' | 'MISSING_SECRETS';
/** What the answer did to the deposit. */
export type DepositCheckResult = 'applied' | 'unchanged' | 'mismatch' | 'still_pending' | 'expired' | 'failed';

/**
 * One ask to the gateway about a deposit, by the sweep or by an administrator (admin spec 007,
 * FR-005). Kept on the deposit's document (`checkLog`); equal failures in a row share one entry.
 */
export interface DepositCheck {
  at: Date;
  /** The latest of the repeats, `at` when there is one. */
  lastAt: Date;
  by: 'sweep' | 'staff';
  staffUserId: string | null;
  answer: DepositCheckAnswer;
  result: DepositCheckResult;
  statusAfter: DepositStatus;
  repeats: number;
}

/** Whether a new check repeats the last one: the same caller got the same answer. */
export function isSameCheck(last: DepositCheck, next: DepositCheck): boolean {
  return last.by === next.by && last.staffUserId === next.staffUserId && last.answer === next.answer && last.result === next.result;
}

/** Whether an administrator may ask the gateway now: a late payment can still turn an expired deposit approved. */
export function canReconcile(status: DepositStatus): boolean {
  return status === 'pending' || status === 'expired';
}

/** When a deposit without a final answer expires. */
export function expiresAtOf(createdAt: Date): Date {
  return new Date(createdAt.getTime() + EXPIRY_MINUTES * MINUTE_MS);
}

export interface DepositProps {
  id: string;
  goalkeeperId: string;
  countryId: string;
  gateway: GatewayName;
  environment: GatewayEnvironment;
  reference: string;
  gatewayTransactionId: string | null;
  amount: number;
  cost: number;
  net: number;
  currency: string;
  status: DepositStatus;
  createdAt: Date;
  finalizedAt: Date | null;
  lastCheckedAt: Date | null;
  nextCheckAt: Date | null;
  checks: number;
}

/**
 * The allowed status changes (research.md §5): a pending deposit takes any final status, and an
 * expired one may still be approved (a late payment is never lost). Everything else is final.
 */
export function canTransition(from: DepositStatus, to: DepositStatus): boolean {
  if (from === 'pending') return to !== 'pending';
  return from === 'expired' && to === 'approved';
}

/** `PPR-` + a UUID v7 without dashes: unique, sortable and within the gateways' limits (research.md §11). */
export function newDepositReference(uuid: string): string {
  return `PPR-${uuid.replace(/-/g, '')}`;
}

/**
 * When a still-pending deposit should be asked about next, or `'expire'` once 48 h have passed: the
 * first scheduled point after `now`, measured from its creation.
 */
export function nextCheckAfter(deposit: Pick<DepositProps, 'createdAt'>, now: Date): Date | 'expire' {
  const created = deposit.createdAt.getTime();
  if (now.getTime() >= created + EXPIRY_MINUTES * MINUTE_MS) return 'expire';
  const next = RECONCILE_SCHEDULE_MINUTES.map((minutes) => created + minutes * MINUTE_MS).find((at) => at > now.getTime());
  return new Date(next ?? created + EXPIRY_MINUTES * MINUTE_MS);
}

/** One attempt to add money to a goalkeeper's operating balance through a payment gateway (feature 022). */
export class Deposit extends Entity<string> {
  readonly goalkeeperId: string;
  readonly countryId: string;
  /** Fixed at start: a later change of the country's gateway never moves an in-flight deposit. */
  readonly gateway: GatewayName;
  /** Also fixed at start: reconciliation asks the same environment the payment was made in. */
  readonly environment: GatewayEnvironment;
  readonly reference: string;
  readonly gatewayTransactionId: string | null;
  /** Whole currency units: what the goalkeeper pays, the gateway's fee, and what reaches the operating balance. */
  readonly amount: number;
  readonly cost: number;
  readonly net: number;
  readonly currency: string;
  readonly status: DepositStatus;
  readonly createdAt: Date;
  readonly finalizedAt: Date | null;
  readonly lastCheckedAt: Date | null;
  readonly nextCheckAt: Date | null;
  readonly checks: number;

  private constructor(props: DepositProps) {
    super(props.id);
    if (!Number.isInteger(props.amount) || props.amount <= 0) throw new Error('Deposit: amount must be a positive integer');
    if (!Number.isInteger(props.cost) || props.cost < 0) throw new Error('Deposit: cost must be a non-negative integer');
    if (props.net !== props.amount - props.cost || props.net < 1) throw new Error('Deposit: net must be amount − cost and at least 1');
    if (!/^[A-Z]{3}$/.test(props.currency)) throw new Error('Deposit: currency must be a 3-letter ISO 4217 code');
    if (!DEPOSIT_STATUSES.includes(props.status)) throw new Error(`Deposit: unknown status '${props.status}'`);
    if (props.environment !== 'sandbox' && props.environment !== 'production') throw new Error('Deposit: environment must be sandbox or production');
    this.goalkeeperId = props.goalkeeperId;
    this.countryId = props.countryId;
    this.gateway = props.gateway;
    this.environment = props.environment;
    this.reference = props.reference;
    this.gatewayTransactionId = props.gatewayTransactionId;
    this.amount = props.amount;
    this.cost = props.cost;
    this.net = props.net;
    this.currency = props.currency;
    this.status = props.status;
    this.createdAt = new Date(props.createdAt);
    this.finalizedAt = props.finalizedAt ? new Date(props.finalizedAt) : null;
    this.lastCheckedAt = props.lastCheckedAt ? new Date(props.lastCheckedAt) : null;
    this.nextCheckAt = props.nextCheckAt ? new Date(props.nextCheckAt) : null;
    this.checks = props.checks;
  }

  static start(args: {
    id: string;
    goalkeeperId: string;
    countryId: string;
    gateway: GatewayName;
    environment: GatewayEnvironment;
    amount: number;
    cost: number;
    currency: string;
    now: Date;
  }): Deposit {
    return new Deposit({
      id: args.id,
      goalkeeperId: args.goalkeeperId,
      countryId: args.countryId,
      gateway: args.gateway,
      environment: args.environment,
      reference: newDepositReference(args.id),
      gatewayTransactionId: null,
      amount: args.amount,
      cost: args.cost,
      net: args.amount - args.cost,
      currency: args.currency,
      status: 'pending',
      createdAt: args.now,
      finalizedAt: null,
      lastCheckedAt: null,
      nextCheckAt: new Date(args.now.getTime() + RECONCILE_SCHEDULE_MINUTES[0] * MINUTE_MS),
      checks: 0,
    });
  }

  static rehydrate(props: DepositProps): Deposit {
    return new Deposit(props);
  }

  toProps(): DepositProps {
    return {
      id: this.id,
      goalkeeperId: this.goalkeeperId,
      countryId: this.countryId,
      gateway: this.gateway,
      environment: this.environment,
      reference: this.reference,
      gatewayTransactionId: this.gatewayTransactionId,
      amount: this.amount,
      cost: this.cost,
      net: this.net,
      currency: this.currency,
      status: this.status,
      createdAt: this.createdAt,
      finalizedAt: this.finalizedAt,
      lastCheckedAt: this.lastCheckedAt,
      nextCheckAt: this.nextCheckAt,
      checks: this.checks,
    };
  }

  /** The deposit after a final status: no more checks are scheduled. */
  finalize(status: FinalDepositStatus, gatewayTransactionId: string | null, now: Date): Deposit {
    return new Deposit({
      ...this.toProps(),
      status,
      gatewayTransactionId: gatewayTransactionId ?? this.gatewayTransactionId,
      finalizedAt: now,
      nextCheckAt: null,
    });
  }
}

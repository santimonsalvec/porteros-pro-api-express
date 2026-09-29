import { Entity } from '../common/entity.js';
import type { GatewayEnvironment, GatewayName } from './gatewaySettings.js';

export const TOP_UP_STATUSES = ['pending', 'approved', 'declined', 'voided', 'error', 'expired'] as const;
export type TopUpStatus = (typeof TOP_UP_STATUSES)[number];
export type FinalTopUpStatus = Exclude<TopUpStatus, 'pending'>;

/** When a pending top-up is asked about, in minutes after its creation (research.md §6). */
export const RECONCILE_SCHEDULE_MINUTES = [15, 60, 360, 1440] as const;
/** A top-up still without a final answer this long after creation is expired. */
export const EXPIRY_MINUTES = 2880;

const MINUTE_MS = 60_000;

export interface TopUpProps {
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
  status: TopUpStatus;
  createdAt: Date;
  finalizedAt: Date | null;
  lastCheckedAt: Date | null;
  nextCheckAt: Date | null;
  checks: number;
}

/**
 * The allowed status changes (research.md §5): a pending top-up takes any final status, and an
 * expired one may still be approved (a late payment is never lost). Everything else is final.
 */
export function canTransition(from: TopUpStatus, to: TopUpStatus): boolean {
  if (from === 'pending') return to !== 'pending';
  return from === 'expired' && to === 'approved';
}

/** `PPR-` + a UUID v7 without dashes: unique, sortable and within the gateways' limits (research.md §11). */
export function newTopUpReference(uuid: string): string {
  return `PPR-${uuid.replace(/-/g, '')}`;
}

/**
 * When a still-pending top-up should be asked about next, or `'expire'` once 48 h have passed: the
 * first scheduled point after `now`, measured from its creation.
 */
export function nextCheckAfter(topUp: Pick<TopUpProps, 'createdAt'>, now: Date): Date | 'expire' {
  const created = topUp.createdAt.getTime();
  if (now.getTime() >= created + EXPIRY_MINUTES * MINUTE_MS) return 'expire';
  const next = RECONCILE_SCHEDULE_MINUTES.map((minutes) => created + minutes * MINUTE_MS).find((at) => at > now.getTime());
  return new Date(next ?? created + EXPIRY_MINUTES * MINUTE_MS);
}

/** One attempt to add money to a goalkeeper's wallet through a payment gateway (feature 022). */
export class TopUp extends Entity<string> {
  readonly goalkeeperId: string;
  readonly countryId: string;
  /** Fixed at start: a later change of the country's gateway never moves an in-flight top-up. */
  readonly gateway: GatewayName;
  /** Also fixed at start: reconciliation asks the same environment the payment was made in. */
  readonly environment: GatewayEnvironment;
  readonly reference: string;
  readonly gatewayTransactionId: string | null;
  /** Whole currency units: what the goalkeeper pays, the gateway's fee, and what reaches the wallet. */
  readonly amount: number;
  readonly cost: number;
  readonly net: number;
  readonly currency: string;
  readonly status: TopUpStatus;
  readonly createdAt: Date;
  readonly finalizedAt: Date | null;
  readonly lastCheckedAt: Date | null;
  readonly nextCheckAt: Date | null;
  readonly checks: number;

  private constructor(props: TopUpProps) {
    super(props.id);
    if (!Number.isInteger(props.amount) || props.amount <= 0) throw new Error('TopUp: amount must be a positive integer');
    if (!Number.isInteger(props.cost) || props.cost < 0) throw new Error('TopUp: cost must be a non-negative integer');
    if (props.net !== props.amount - props.cost || props.net < 1) throw new Error('TopUp: net must be amount − cost and at least 1');
    if (!/^[A-Z]{3}$/.test(props.currency)) throw new Error('TopUp: currency must be a 3-letter ISO 4217 code');
    if (!TOP_UP_STATUSES.includes(props.status)) throw new Error(`TopUp: unknown status '${props.status}'`);
    if (props.environment !== 'sandbox' && props.environment !== 'production') throw new Error('TopUp: environment must be sandbox or production');
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
  }): TopUp {
    return new TopUp({
      id: args.id,
      goalkeeperId: args.goalkeeperId,
      countryId: args.countryId,
      gateway: args.gateway,
      environment: args.environment,
      reference: newTopUpReference(args.id),
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

  static rehydrate(props: TopUpProps): TopUp {
    return new TopUp(props);
  }

  toProps(): TopUpProps {
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

  /** The top-up after a final status: no more checks are scheduled. */
  finalize(status: FinalTopUpStatus, gatewayTransactionId: string | null, now: Date): TopUp {
    return new TopUp({
      ...this.toProps(),
      status,
      gatewayTransactionId: gatewayTransactionId ?? this.gatewayTransactionId,
      finalizedAt: now,
      nextCheckAt: null,
    });
  }
}

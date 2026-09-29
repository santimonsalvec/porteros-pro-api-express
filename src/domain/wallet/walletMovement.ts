import { Entity } from '../common/entity.js';

/** Every kind of change to a goalkeeper's balance (data-model.md "MovementType and signs"). */
export const MOVEMENT_TYPES = [
  'top_up',
  'commission_charge',
  'commission_refund',
  'penalty',
  'penalty_reversal',
  'admin_adjustment',
  'gateway_fee',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Credits (+), debits (−), or either for an administrator's adjustment. */
const SIGN: Record<MovementType, 1 | -1 | 0> = {
  top_up: 1,
  commission_charge: -1,
  commission_refund: 1,
  penalty: -1,
  penalty_reversal: 1,
  admin_adjustment: 0,
  gateway_fee: -1,
};

export interface MovementActor {
  kind: 'system' | 'goalkeeper' | 'admin';
  userId: string | null;
}

export interface MovementReferences {
  bookingId?: string;
  requestId?: string;
  topUpId?: string;
  caseId?: string;
  penaltyMovementId?: string;
}

/** Why a commission was given back (FR-004). */
export interface CancellationDetails {
  by: 'client' | 'system' | 'admin';
  at: Date;
  reason: string;
}

/** The goalkeeper's identification when the movement happened — for invoicing later (FR-005). */
export interface InvoicingSnapshot {
  documentType: string;
  documentNumber: string;
}

export interface WalletMovementProps {
  id: string;
  walletId: string;
  sequence: number;
  type: MovementType;
  amount: number;
  currency: string;
  balanceAfter: number;
  occurredAt: Date;
  causeKey: string;
  actor: MovementActor;
  references: MovementReferences;
  cancellation: CancellationDetails | null;
  reason: string | null;
  invoicing: InvoicingSnapshot;
}

/**
 * Only penalties may take a balance below zero (FR-008): every other debit is guarded by the
 * store so it is refused instead. A top-up's gateway fee (feature 022) is exempt too: it always
 * follows the larger credit of the same top-up, so it never creates a debt, but it must not be
 * refused when that credit only partly covered an existing one.
 */
export function isGuardedDebit(type: MovementType, amount: number): boolean {
  return amount < 0 && type !== 'penalty' && type !== 'gateway_fee';
}

/** Validates the fields a movement of this type must (and must not) have; throws naming the field. */
export function assertMovementShape(fields: Omit<WalletMovementProps, 'id' | 'walletId' | 'sequence' | 'balanceAfter'>): void {
  if (!MOVEMENT_TYPES.includes(fields.type)) throw new Error(`WalletMovement: unknown type '${fields.type}'`);
  if (!Number.isInteger(fields.amount) || fields.amount === 0) {
    throw new Error('WalletMovement: amount must be a non-zero integer');
  }
  const sign = SIGN[fields.type];
  if (sign !== 0 && Math.sign(fields.amount) !== sign) {
    throw new Error(`WalletMovement: amount of a ${fields.type} must be ${sign > 0 ? 'positive' : 'negative'}`);
  }
  if (!/^[A-Z]{3}$/.test(fields.currency)) throw new Error('WalletMovement: currency must be a 3-letter ISO 4217 code');
  if (fields.cancellation !== null && fields.type !== 'commission_refund') {
    throw new Error('WalletMovement: cancellation is only recorded on a commission refund');
  }
  if (fields.type === 'admin_adjustment') {
    if (typeof fields.reason !== 'string' || fields.reason.trim() === '') {
      throw new Error('WalletMovement: reason is required on an administrative adjustment');
    }
  } else if (fields.reason !== null) {
    throw new Error('WalletMovement: reason is only recorded on an administrative adjustment');
  }
  if (!fields.causeKey) throw new Error('WalletMovement: causeKey is required');
}

/** One immutable entry of a goalkeeper's wallet. Never edited, never deleted (FR-002). */
export class WalletMovement extends Entity<string> {
  readonly walletId: string;
  /** Consecutive per wallet: the single order of all its movements (FR-007). */
  readonly sequence: number;
  readonly type: MovementType;
  /** Signed, whole currency units. */
  readonly amount: number;
  readonly currency: string;
  readonly balanceAfter: number;
  readonly occurredAt: Date;
  /** Unique per cause: the same cause never yields two movements (FR-006). */
  readonly causeKey: string;
  readonly actor: MovementActor;
  readonly references: MovementReferences;
  readonly cancellation: CancellationDetails | null;
  readonly reason: string | null;
  readonly invoicing: InvoicingSnapshot;

  private constructor(props: WalletMovementProps) {
    super(props.id);
    assertMovementShape(props);
    if (!Number.isInteger(props.sequence) || props.sequence < 1) {
      throw new Error('WalletMovement: sequence must be an integer of at least 1');
    }
    if (!Number.isInteger(props.balanceAfter)) throw new Error('WalletMovement: balanceAfter must be an integer');
    this.walletId = props.walletId;
    this.sequence = props.sequence;
    this.type = props.type;
    this.amount = props.amount;
    this.currency = props.currency;
    this.balanceAfter = props.balanceAfter;
    this.occurredAt = new Date(props.occurredAt);
    this.causeKey = props.causeKey;
    this.actor = props.actor;
    this.references = props.references;
    this.cancellation = props.cancellation;
    this.reason = props.reason;
    this.invoicing = props.invoicing;
  }

  static rehydrate(props: WalletMovementProps): WalletMovement {
    return new WalletMovement(props);
  }
}

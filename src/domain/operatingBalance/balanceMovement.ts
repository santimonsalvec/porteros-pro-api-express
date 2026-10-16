import { Entity } from '../common/entity.js';

/** Every kind of change to a goalkeeper's balance (data-model.md "MovementType and signs"). */
export const MOVEMENT_TYPES = [
  'deposit',
  'commission_charge',
  'commission_refund',
  'penalty',
  'penalty_reversal',
  'admin_adjustment',
  'gateway_fee',
  'commission_vat',
  'commission_vat_refund',
  'penalty_vat',
  'penalty_vat_reversal',
  /** What an administrator returns to a user who closes the account (feature 029). */
  'closure_refund',
  /** A debt an administrator forgives so the account can close (feature 029). */
  'debt_waiver',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Credits (+), debits (−), or either for an administrator's adjustment. */
const SIGN: Record<MovementType, 1 | -1 | 0> = {
  deposit: 1,
  commission_charge: -1,
  commission_refund: 1,
  penalty: -1,
  penalty_reversal: 1,
  admin_adjustment: 0,
  gateway_fee: -1,
  commission_vat: -1,
  commission_vat_refund: 1,
  penalty_vat: -1,
  penalty_vat_reversal: 1,
  closure_refund: -1,
  debt_waiver: 1,
};

/** The VAT charged on top of a commission or penalty, and its refund (feature 023). */
export const VAT_MOVEMENT_TYPES: readonly MovementType[] = ['commission_vat', 'commission_vat_refund', 'penalty_vat', 'penalty_vat_reversal'];

/** The movements that produce an invoicing document (feature 023); their VAT travels with them. */
export const BILLABLE_MOVEMENT_TYPES = ['commission_charge', 'commission_refund', 'penalty', 'penalty_reversal'] as const;
export type BillableMovementType = (typeof BILLABLE_MOVEMENT_TYPES)[number];

export interface MovementActor {
  kind: 'system' | 'goalkeeper' | 'admin';
  userId: string | null;
}

export interface MovementReferences {
  bookingId?: string;
  requestId?: string;
  depositId?: string;
  caseId?: string;
  penaltyMovementId?: string;
  closureId?: string;
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

export interface BalanceMovementProps {
  id: string;
  operatingBalanceId: string;
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
  /** The VAT rate a VAT movement was charged at (basis points); absent/null on every other type (feature 023). */
  taxRateBps?: number | null;
  /**
   * The market it happened in, written once (spec 031, FR-043): the booking's for its charges, what
   * a refund or reversal gives back keeps the original's, the goalkeeper's market then for the rest.
   */
  marketId: string;
}

/**
 * Only penalties may take a balance below zero (FR-008): every other debit is guarded by the
 * store so it is refused instead. A deposit's gateway fee (feature 022) is exempt too: it always
 * follows the larger credit of the same deposit, so it never creates a debt, but it must not be
 * refused when that credit only partly covered an existing one. A penalty's VAT (feature 023)
 * follows its penalty; a commission's VAT stays guarded, like the commission.
 */
export function isGuardedDebit(type: MovementType, amount: number): boolean {
  return amount < 0 && type !== 'penalty' && type !== 'gateway_fee' && type !== 'penalty_vat';
}

/** Validates the fields a movement of this type must (and must not) have; throws naming the field. */
export function assertMovementShape(fields: Omit<BalanceMovementProps, 'id' | 'operatingBalanceId' | 'sequence' | 'balanceAfter'>): void {
  if (!MOVEMENT_TYPES.includes(fields.type)) throw new Error(`BalanceMovement: unknown type '${fields.type}'`);
  if (!Number.isInteger(fields.amount) || fields.amount === 0) {
    throw new Error('BalanceMovement: amount must be a non-zero integer');
  }
  const sign = SIGN[fields.type];
  if (sign !== 0 && Math.sign(fields.amount) !== sign) {
    throw new Error(`BalanceMovement: amount of a ${fields.type} must be ${sign > 0 ? 'positive' : 'negative'}`);
  }
  if (!/^[A-Z]{3}$/.test(fields.currency)) throw new Error('BalanceMovement: currency must be a 3-letter ISO 4217 code');
  if (fields.cancellation !== null && fields.type !== 'commission_refund') {
    throw new Error('BalanceMovement: cancellation is only recorded on a commission refund');
  }
  if (fields.type === 'admin_adjustment' || fields.type === 'debt_waiver') {
    if (typeof fields.reason !== 'string' || fields.reason.trim() === '') {
      throw new Error('BalanceMovement: reason is required on an administrative adjustment or a debt waiver');
    }
  } else if (fields.reason !== null) {
    throw new Error('BalanceMovement: reason is only recorded on an administrative adjustment or a debt waiver');
  }
  if (!fields.causeKey) throw new Error('BalanceMovement: causeKey is required');
  if (typeof fields.marketId !== 'string' || fields.marketId.trim() === '') throw new Error('BalanceMovement: marketId is required');
  const rate = fields.taxRateBps ?? null;
  if (VAT_MOVEMENT_TYPES.includes(fields.type)) {
    if (rate === null || !Number.isInteger(rate) || rate < 0 || rate > 10_000) {
      throw new Error('BalanceMovement: taxRateBps (0–10000) is required on a VAT movement');
    }
  } else if (rate !== null) {
    throw new Error('BalanceMovement: taxRateBps is only recorded on a VAT movement');
  }
}

/** One immutable entry of a goalkeeper's operating balance. Never edited, never deleted (FR-002). */
export class BalanceMovement extends Entity<string> {
  readonly operatingBalanceId: string;
  /** Consecutive per operating balance: the single order of all its movements (FR-007). */
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
  readonly taxRateBps: number | null;
  readonly marketId: string;

  private constructor(props: BalanceMovementProps) {
    super(props.id);
    assertMovementShape(props);
    if (!Number.isInteger(props.sequence) || props.sequence < 1) {
      throw new Error('BalanceMovement: sequence must be an integer of at least 1');
    }
    if (!Number.isInteger(props.balanceAfter)) throw new Error('BalanceMovement: balanceAfter must be an integer');
    this.operatingBalanceId = props.operatingBalanceId;
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
    this.taxRateBps = props.taxRateBps ?? null;
    this.marketId = props.marketId;
  }

  static rehydrate(props: BalanceMovementProps): BalanceMovement {
    return new BalanceMovement(props);
  }
}

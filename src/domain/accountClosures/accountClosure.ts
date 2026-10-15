/**
 * A user's request to leave the platform (feature 029). While it is open the account is inactive;
 * an administrator resolves a debt, records the refund of what is left and closes the account
 * (a logical deletion — movements, invoices and audits stay). Immutable: every transition returns
 * a new closure, or says why it can't.
 *
 *   requested ─refund─▶ refund_recorded ─close─▶ closed ─(sign in)─▶ reopened
 *       ├─ cancel (user) ─▶ cancelled
 *       └─ reject (admin) ─▶ rejected
 */
export const CLOSURE_STATUSES = ['requested', 'refund_recorded', 'closed', 'cancelled', 'rejected', 'reopened'] as const;
export type ClosureStatus = (typeof CLOSURE_STATUSES)[number];

/** The states in which the account is inactive. */
export const OPEN_CLOSURE_STATUSES: readonly ClosureStatus[] = ['requested', 'refund_recorded'];

export type ClosureRole = 'goalkeeper' | 'client';
export type DebtResolution = 'deposit_required' | 'waived';
export type ClosureAction = 'debt_deposit_required' | 'waive_debt' | 'refund' | 'close' | 'reject';

export const CLOSURE_REASON_MIN = 3;
export const CLOSURE_REASON_MAX = 300;

/** Why a reason is refused, or `null` when it is fine (trimmed). */
export function closureReasonIssue(reason: string): string | null {
  const length = reason.trim().length;
  if (length < CLOSURE_REASON_MIN) return `The reason needs at least ${CLOSURE_REASON_MIN} characters.`;
  if (length > CLOSURE_REASON_MAX) return `The reason takes at most ${CLOSURE_REASON_MAX} characters.`;
  return null;
}

export interface ClosureRefund {
  /** What was returned: the balance at that moment, possibly 0. */
  amount: number;
  /** The proof of the transfer; required when `amount > 0`. */
  reference: string | null;
  /** `YYYY-MM-DD`; required when `amount > 0`. */
  paidOn: string | null;
  note: string | null;
  /** The `closure_refund` movement; `null` when nothing was returned. */
  movementId: string | null;
  recordedBy: string;
  recordedAt: Date;
}

export interface AccountClosureProps {
  id: string;
  userId: string;
  role: ClosureRole;
  status: ClosureStatus;
  requestedAt: Date;
  balanceAtRequest: number | null;
  currency: string | null;
  debtResolution: DebtResolution | null;
  debtResolvedBy: string | null;
  debtResolvedAt: Date | null;
  debtReason: string | null;
  refund: ClosureRefund | null;
  closedAt: Date | null;
  closedBy: string | null;
  reopenedAt: Date | null;
  endedAt: Date | null;
  endedBy: string | null;
  endReason: string | null;
  updatedAt: Date;
}

export type TransitionFailure = 'invalid_transition' | 'reason_invalid' | 'debt_not_applicable' | 'refund_details_required';
export type Transition = { ok: true; closure: AccountClosure } | { ok: false; reason: TransitionFailure };

const fail = (reason: TransitionFailure): Transition => ({ ok: false, reason });

export class AccountClosure {
  private constructor(private readonly props: AccountClosureProps) {}

  static request(args: {
    id: string;
    userId: string;
    role: ClosureRole;
    balanceAtRequest: number | null;
    currency: string | null;
    now: Date;
  }): AccountClosure {
    return new AccountClosure({
      id: args.id,
      userId: args.userId,
      role: args.role,
      status: 'requested',
      requestedAt: args.now,
      balanceAtRequest: args.balanceAtRequest,
      currency: args.currency,
      debtResolution: null,
      debtResolvedBy: null,
      debtResolvedAt: null,
      debtReason: null,
      refund: null,
      closedAt: null,
      closedBy: null,
      reopenedAt: null,
      endedAt: null,
      endedBy: null,
      endReason: null,
      updatedAt: args.now,
    });
  }

  static rehydrate(props: AccountClosureProps): AccountClosure {
    return new AccountClosure({ ...props });
  }

  toProps(): AccountClosureProps {
    return { ...this.props };
  }

  get id(): string { return this.props.id; }
  get userId(): string { return this.props.userId; }
  get role(): ClosureRole { return this.props.role; }
  get status(): ClosureStatus { return this.props.status; }
  get requestedAt(): Date { return this.props.requestedAt; }
  get balanceAtRequest(): number | null { return this.props.balanceAtRequest; }
  get currency(): string | null { return this.props.currency; }
  get debtResolution(): DebtResolution | null { return this.props.debtResolution; }
  get debtResolvedBy(): string | null { return this.props.debtResolvedBy; }
  get debtReason(): string | null { return this.props.debtReason; }
  get refund(): ClosureRefund | null { return this.props.refund; }
  get closedAt(): Date | null { return this.props.closedAt; }
  get closedBy(): string | null { return this.props.closedBy; }
  get reopenedAt(): Date | null { return this.props.reopenedAt; }
  get endedAt(): Date | null { return this.props.endedAt; }
  get endedBy(): string | null { return this.props.endedBy; }
  get endReason(): string | null { return this.props.endReason; }
  get updatedAt(): Date { return this.props.updatedAt; }

  /** Whether the account is inactive because of this request. */
  get isOpen(): boolean {
    return OPEN_CLOSURE_STATUSES.includes(this.props.status);
  }

  /** The user withdraws the request, as long as no refund was recorded. */
  cancel(now: Date): Transition {
    if (this.props.status !== 'requested') return fail('invalid_transition');
    return this.next({ status: 'cancelled', endedAt: now, endedBy: this.props.userId, endReason: null, updatedAt: now });
  }

  /** An administrator turns the request down; the account is active again. */
  reject(args: { by: string; reason: string; now: Date }): Transition {
    if (this.props.status !== 'requested') return fail('invalid_transition');
    if (closureReasonIssue(args.reason)) return fail('reason_invalid');
    return this.next({ status: 'rejected', endedAt: args.now, endedBy: args.by, endReason: args.reason.trim(), updatedAt: args.now });
  }

  /** The debt is to be covered by a deposit before the account can close. */
  requireDebtDeposit(args: { by: string; now: Date; balance: number }): Transition {
    if (this.props.status !== 'requested') return fail('invalid_transition');
    if (args.balance >= 0) return fail('debt_not_applicable');
    return this.next({ debtResolution: 'deposit_required', debtResolvedBy: args.by, debtResolvedAt: args.now, debtReason: null, updatedAt: args.now });
  }

  /** The debt is forgiven, with a reason. */
  waiveDebt(args: { by: string; reason: string; now: Date; balance: number }): Transition {
    if (this.props.status !== 'requested') return fail('invalid_transition');
    if (args.balance >= 0) return fail('debt_not_applicable');
    if (closureReasonIssue(args.reason)) return fail('reason_invalid');
    return this.next({ debtResolution: 'waived', debtResolvedBy: args.by, debtResolvedAt: args.now, debtReason: args.reason.trim(), updatedAt: args.now });
  }

  /** What was returned to the user; `amount` is the balance at that moment (0 is allowed). */
  recordRefund(args: {
    by: string;
    now: Date;
    amount: number;
    reference: string | null;
    paidOn: string | null;
    note: string | null;
    movementId: string | null;
  }): Transition {
    if (this.props.status !== 'requested') return fail('invalid_transition');
    if (args.amount > 0 && (!args.reference?.trim() || !args.paidOn)) return fail('refund_details_required');
    const refund: ClosureRefund = {
      amount: args.amount,
      reference: args.reference?.trim() || null,
      paidOn: args.paidOn,
      note: args.note?.trim() || null,
      movementId: args.movementId,
      recordedBy: args.by,
      recordedAt: args.now,
    };
    return this.next({ status: 'refund_recorded', refund, updatedAt: args.now });
  }

  /** The logical deletion: the refund was recorded, the account is closed. */
  close(args: { by: string; now: Date }): Transition {
    if (this.props.status !== 'refund_recorded') return fail('invalid_transition');
    return this.next({ status: 'closed', closedAt: args.now, closedBy: args.by, updatedAt: args.now });
  }

  /** Its user signed in again: the account is back, with its history. */
  reopen(now: Date): Transition {
    if (this.props.status !== 'closed') return fail('invalid_transition');
    return this.next({ status: 'reopened', reopenedAt: now, updatedAt: now });
  }

  /**
   * What an administrator may do now. `balance` is the current balance (`null` for a client, who has
   * none); `blockers` counts what prevents the refund: accepted matches, pending deposits, open cases.
   */
  allowedActions(args: { balance: number | null; blockers: number }): ClosureAction[] {
    if (this.props.status === 'refund_recorded') return ['close'];
    if (this.props.status !== 'requested') return [];
    const balance = args.balance ?? 0;
    if (balance < 0) {
      return this.props.debtResolution === 'deposit_required' ? ['waive_debt', 'reject'] : ['debt_deposit_required', 'waive_debt', 'reject'];
    }
    return args.blockers === 0 ? ['refund', 'reject'] : ['reject'];
  }

  private next(changes: Partial<AccountClosureProps>): Transition {
    return { ok: true, closure: new AccountClosure({ ...this.props, ...changes }) };
  }
}

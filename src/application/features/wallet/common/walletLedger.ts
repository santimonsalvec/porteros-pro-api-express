import type { IClock } from '../../../common/clock.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type {
  CancellationDetails,
  InvoicingSnapshot,
  MovementActor,
  MovementReferences,
  MovementType,
} from '../../../../domain/wallet/walletMovement.js';
import { assertMovementShape } from '../../../../domain/wallet/walletMovement.js';
import type { AppendResult, IWalletMovementRepository, IWalletStore, MovementDraft } from './ports.js';

/** Who and in which currency — what every movement needs besides its own fields. */
export interface LedgerOwner {
  goalkeeperId: string;
  currency: string;
  invoicing: InvoicingSnapshot;
}

export type RefundResult = AppendResult | { kind: 'nothing_to_refund' };
export type ReversalResult = AppendResult | { kind: 'nothing_to_reverse' };

const SYSTEM: MovementActor = { kind: 'system', userId: null };

/**
 * The commission charge for one booking, as a draft. Shared by `WalletLedger.chargeCommission` and
 * the booking-acceptance transaction (012), which records it inside its own session.
 */
export function commissionChargeDraft(
  owner: LedgerOwner,
  args: { bookingId: string; requestId: string; amount: number },
  id: string,
  occurredAt: Date,
): MovementDraft {
  return {
    id,
    goalkeeperId: owner.goalkeeperId,
    type: 'commission_charge',
    amount: -args.amount,
    currency: owner.currency,
    occurredAt,
    causeKey: `commission:${args.bookingId}`,
    actor: SYSTEM,
    references: { bookingId: args.bookingId, requestId: args.requestId },
    cancellation: null,
    reason: null,
    invoicing: owner.invoicing,
  };
}

/**
 * The only writer of wallet movements (research.md §10). Each method turns a business event into a
 * typed movement — its sign, cause key, references and actor — so no caller can record a movement
 * of the wrong shape. The same cause is recorded at most once: a known cause key is answered from
 * the existing movement without touching the balance (FR-006).
 */
export class WalletLedger {
  constructor(
    private readonly store: IWalletStore,
    private readonly movements: IWalletMovementRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly clock: IClock,
  ) {}

  /** The commission for one accepted booking; refused (`insufficient_funds`) when unaffordable (FR-013). */
  async chargeCommission(owner: LedgerOwner, args: { bookingId: string; requestId: string; amount: number }): Promise<AppendResult> {
    const draft = commissionChargeDraft(owner, args, this.idGenerator.newId(), this.clock.now());
    const known = await this.movements.findByCauseKey(draft.causeKey);
    if (known) return { kind: 'duplicate', movement: known };
    assertMovementShape(draft);
    return this.store.append(draft);
  }

  /** Gives back exactly what was charged for that booking, whatever the commission is now (FR-011). */
  async refundCommission(
    owner: LedgerOwner,
    args: { bookingId: string; requestId: string; cancellation: CancellationDetails },
  ): Promise<RefundResult> {
    const charge = await this.movements.findByCauseKey(`commission:${args.bookingId}`);
    if (!charge) return { kind: 'nothing_to_refund' };
    return this.record(owner, {
      type: 'commission_refund',
      amount: -charge.amount,
      causeKey: `commission_refund:${args.bookingId}`,
      references: { bookingId: args.bookingId, requestId: args.requestId },
      cancellation: args.cancellation,
    });
  }

  /** The only debit allowed to leave the balance below zero (FR-008). */
  applyPenalty(
    owner: LedgerOwner,
    args: { penaltyEventId: string; amount: number; references?: MovementReferences },
  ): Promise<AppendResult> {
    return this.record(owner, {
      type: 'penalty',
      amount: -args.amount,
      causeKey: `penalty:${args.penaltyEventId}`,
      references: args.references ?? {},
    });
  }

  /** Returns exactly what the penalty of that event took (at most once). */
  async reversePenalty(
    owner: LedgerOwner,
    args: { penaltyEventId: string; actor: MovementActor },
  ): Promise<ReversalResult> {
    const penalty = await this.movements.findByCauseKey(`penalty:${args.penaltyEventId}`);
    if (!penalty) return { kind: 'nothing_to_reverse' };
    return this.record(owner, {
      type: 'penalty_reversal',
      amount: -penalty.amount,
      causeKey: `penalty_reversal:${penalty.id}`,
      references: { ...penalty.references, penaltyMovementId: penalty.id },
      actor: args.actor,
    });
  }

  /** A paid top-up (the payment gateway arrives in feature 022). */
  creditTopUp(owner: LedgerOwner, args: { topUpId: string; amount: number }): Promise<AppendResult> {
    return this.record(owner, {
      type: 'top_up',
      amount: args.amount,
      causeKey: `top_up:${args.topUpId}`,
      references: { topUpId: args.topUpId },
    });
  }

  /** An administrator's manual credit or debit, idempotent per operation key (FR-017). */
  adjust(
    owner: LedgerOwner,
    args: { adminUserId: string; amount: number; reason: string; operationKey: string },
  ): Promise<AppendResult> {
    return this.record(owner, {
      type: 'admin_adjustment',
      amount: args.amount,
      causeKey: `adjustment:${args.operationKey}`,
      references: {},
      reason: args.reason.trim(),
      actor: { kind: 'admin', userId: args.adminUserId },
    });
  }

  private async record(
    owner: LedgerOwner,
    movement: {
      type: MovementType;
      amount: number;
      causeKey: string;
      references: MovementReferences;
      cancellation?: CancellationDetails;
      reason?: string;
      actor?: MovementActor;
    },
  ): Promise<AppendResult> {
    const known = await this.movements.findByCauseKey(movement.causeKey);
    if (known) return { kind: 'duplicate', movement: known };

    const draft: MovementDraft = {
      id: this.idGenerator.newId(),
      goalkeeperId: owner.goalkeeperId,
      type: movement.type,
      amount: movement.amount,
      currency: owner.currency,
      occurredAt: this.clock.now(),
      causeKey: movement.causeKey,
      actor: movement.actor ?? SYSTEM,
      references: movement.references,
      cancellation: movement.cancellation ?? null,
      reason: movement.reason ?? null,
      invoicing: owner.invoicing,
    };
    // Fail fast on a malformed movement, before opening a transaction.
    assertMovementShape(draft);
    return this.store.append(draft);
  }
}

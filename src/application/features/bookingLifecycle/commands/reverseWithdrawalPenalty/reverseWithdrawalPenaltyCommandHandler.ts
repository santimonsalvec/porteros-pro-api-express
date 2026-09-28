import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IBookingAuditLogger } from '../../../goalkeeperRequests/common/ports.js';
import {
  resolveGoalkeeperWalletContext,
  type GoalkeeperWalletContextDependencies,
} from '../../../wallet/common/goalkeeperWalletContext.js';
import type { LedgerOwner } from '../../../wallet/common/walletLedger.js';
import type { IBookingLifecycleStore, ILifecycleLogger } from '../../common/ports.js';
import { toWithdrawalItem } from '../../common/withdrawalResponses.js';
import { ReverseWithdrawalPenaltyCommand, type ReverseWithdrawalPenaltyResult } from './reverseWithdrawalPenaltyCommand.js';

export const REVERSAL_REASON_MIN = 3;
export const REVERSAL_REASON_MAX = 500;

export interface ReverseWithdrawalPenaltyDependencies {
  walletContext: GoalkeeperWalletContextDependencies;
  store: IBookingLifecycleStore;
  idGenerator: IIdGenerator;
  clock: IClock;
  audit: IBookingAuditLogger;
  logger: ILifecycleLogger;
}

/**
 * Force majeure or an error (FR-017–FR-021). The store does it all in one transaction: the refund
 * through the shared per-booking key, the lifted penalties, the forgiveness and the recomputed
 * suspension end. Asking again for what's already reversed changes nothing.
 */
export class ReverseWithdrawalPenaltyCommandHandler implements ICommandHandler<ReverseWithdrawalPenaltyCommand, ReverseWithdrawalPenaltyResult> {
  constructor(private readonly deps: ReverseWithdrawalPenaltyDependencies) {}

  async handle(command: ReverseWithdrawalPenaltyCommand): Promise<ReverseWithdrawalPenaltyResult> {
    const result = await this.reverse(command);
    this.deps.audit.logPenaltyReversal({
      outcome: result.outcome,
      adminId: command.adminId,
      goalkeeperId: command.goalkeeperId,
      withdrawalId: command.withdrawalId,
    });
    return result;
  }

  private async reverse(command: ReverseWithdrawalPenaltyCommand): Promise<ReverseWithdrawalPenaltyResult> {
    const reason = command.reason.trim();
    const errors: Record<string, string> = {};
    if (reason.length < REVERSAL_REASON_MIN || reason.length > REVERSAL_REASON_MAX) {
      errors.reason = `reason must have between ${REVERSAL_REASON_MIN} and ${REVERSAL_REASON_MAX} characters`;
    }
    if (!command.refund && !command.liftSuspension) errors.body = 'Ask for refund, liftSuspension or both';
    if (Object.keys(errors).length > 0) return { outcome: 'invalid_request', errors };

    const context = await resolveGoalkeeperWalletContext(this.deps.walletContext, command.goalkeeperId);
    if (context.kind === 'not_a_goalkeeper') return { outcome: 'not_a_goalkeeper' };
    let owner: LedgerOwner | null = null;
    if (context.kind === 'ok') owner = { goalkeeperId: command.goalkeeperId, currency: context.currency, invoicing: context.invoicing };
    else if (command.refund) return { outcome: 'wallet_not_configured', cityId: context.cityId };

    const result = await this.deps.store.reverseWithdrawal({
      goalkeeperId: command.goalkeeperId,
      withdrawalId: command.withdrawalId,
      adminId: command.adminId,
      refund: command.refund,
      liftSuspension: command.liftSuspension,
      reason,
      now: this.deps.clock.now(),
      owner,
      newId: () => this.deps.idGenerator.newId(),
    });
    switch (result.kind) {
      case 'reversed':
      case 'replayed':
        return {
          outcome: result.kind,
          withdrawal: toWithdrawalItem(result.incident, 'admin'),
          suspendedUntil: result.suspendedUntil?.toISOString() ?? null,
        };
      case 'not_found':
        return { outcome: 'withdrawal_not_found' };
      case 'missing_charge':
        this.deps.logger.warn({ outcome: 'reversal_missing_charge', bookingId: result.bookingId }, 'Withdrawal reversal: no commission charge to refund');
        return { outcome: 'missing_charge', bookingId: result.bookingId };
    }
  }
}

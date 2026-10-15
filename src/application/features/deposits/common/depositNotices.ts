import type { Deposit } from '../../../../domain/deposits/deposit.js';
import { depositApprovedMessage, depositFailedMessage } from '../../../../domain/notifications/depositMessages.js';
import { notifyOnce, type NotifyOnceDependencies } from '../../bookingLifecycle/common/notifyOnce.js';

/**
 * Tells the goalkeeper how a deposit ended (clarification 2), once per outcome: the approval with
 * the net and the new balance, or the failure (declined, voided, error or expired).
 */
export async function notifyDepositOutcome(deps: NotifyOnceDependencies, deposit: Deposit, balance: number | null): Promise<void> {
  if (deposit.status === 'pending') return;
  if (deposit.status === 'approved') {
    await notifyOnce(deps, {
      userId: deposit.goalkeeperId,
      message: depositApprovedMessage(deposit.net, balance ?? deposit.net, deposit.currency, deposit.id),
      dedupeKey: `deposit:${deposit.id}:approved`,
    });
    return;
  }
  await notifyOnce(deps, {
    userId: deposit.goalkeeperId,
    message: depositFailedMessage(deposit.amount, deposit.currency, deposit.id),
    dedupeKey: `deposit:${deposit.id}:failed`,
  });
}

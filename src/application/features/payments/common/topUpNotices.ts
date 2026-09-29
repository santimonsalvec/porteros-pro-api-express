import type { TopUp } from '../../../../domain/payments/topUp.js';
import { topUpApprovedMessage, topUpFailedMessage } from '../../../../domain/notifications/topUpMessages.js';
import { notifyOnce, type NotifyOnceDependencies } from '../../bookingLifecycle/common/notifyOnce.js';

/**
 * Tells the goalkeeper how a top-up ended (clarification 2), once per outcome: the approval with
 * the net and the new balance, or the failure (declined, voided, error or expired).
 */
export async function notifyTopUpOutcome(deps: NotifyOnceDependencies, topUp: TopUp, balance: number | null): Promise<void> {
  if (topUp.status === 'pending') return;
  if (topUp.status === 'approved') {
    await notifyOnce(deps, {
      userId: topUp.goalkeeperId,
      message: topUpApprovedMessage(topUp.net, balance ?? topUp.net, topUp.currency, topUp.id),
      dedupeKey: `top-up:${topUp.id}:approved`,
    });
    return;
  }
  await notifyOnce(deps, {
    userId: topUp.goalkeeperId,
    message: topUpFailedMessage(topUp.amount, topUp.currency, topUp.id),
    dedupeKey: `top-up:${topUp.id}:failed`,
  });
}

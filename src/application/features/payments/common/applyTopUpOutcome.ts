import type { FinalTopUpStatus, TopUp } from '../../../../domain/payments/topUp.js';
import type { NotifyOnceDependencies } from '../../bookingLifecycle/common/notifyOnce.js';
import { resolveGoalkeeperWalletContext, type GoalkeeperWalletContextDependencies } from '../../wallet/common/goalkeeperWalletContext.js';
import type { ApplyOutcomeResult, GatewayOutcome, IPaymentsLogger, ITopUpStore } from './ports.js';
import { notifyTopUpOutcome } from './topUpNotices.js';

export interface ApplyTopUpOutcomeDependencies {
  walletContext: GoalkeeperWalletContextDependencies;
  store: ITopUpStore;
  notices: NotifyOnceDependencies;
  logger: IPaymentsLogger;
}

const FINAL_STATUS: Record<Exclude<GatewayOutcome['status'], 'PENDING'>, FinalTopUpStatus> = {
  APPROVED: 'approved',
  DECLINED: 'declined',
  VOIDED: 'voided',
  ERROR: 'error',
};

export function finalStatusOf(status: GatewayOutcome['status']): FinalTopUpStatus | null {
  return status === 'PENDING' ? null : FINAL_STATUS[status];
}

/**
 * Applies a final status to a top-up (shared by the webhook and the reconciliation): resolves the
 * wallet's owner, runs the store's transaction, warns on a mismatch and notifies a change.
 * `outcome` is the gateway's answer, or `null` for an expiry, which has no charge to compare.
 */
export async function applyTopUpOutcome(
  deps: ApplyTopUpOutcomeDependencies,
  topUp: TopUp,
  status: FinalTopUpStatus,
  outcome: GatewayOutcome | null,
  now: Date,
): Promise<ApplyOutcomeResult> {
  const context = await resolveGoalkeeperWalletContext(deps.walletContext, topUp.goalkeeperId);
  if (context.kind !== 'ok') {
    // The top-up exists, so its goalkeeper had a wallet; losing it is an operations problem.
    throw new Error(`Top-up ${topUp.id}: the goalkeeper's wallet cannot be resolved (${context.kind})`);
  }
  const result = await deps.store.applyOutcome({
    topUpId: topUp.id,
    status,
    gatewayTransactionId: outcome?.transactionId ?? null,
    charged: outcome ? { amountInCents: outcome.amountInCents, currency: outcome.currency } : null,
    owner: { goalkeeperId: context.profile.userId, currency: context.currency, invoicing: context.invoicing },
    now,
  });
  if (result.kind === 'mismatch') {
    deps.logger.warn(
      {
        outcome: 'top_up_mismatch',
        topUpId: topUp.id,
        reference: topUp.reference,
        expected: { amountInCents: topUp.amount * 100, currency: topUp.currency },
        got: outcome ? { amountInCents: outcome.amountInCents, currency: outcome.currency } : null,
      },
      'Top-up not credited: the gateway charged another amount or currency',
    );
  }
  if (result.kind === 'applied') {
    deps.logger.info(
      { outcome: 'top_up_applied', topUpId: topUp.id, reference: topUp.reference, status: result.topUp.status, credited: status === 'approved' },
      'Top-up outcome applied',
    );
    await notifyTopUpOutcome(deps.notices, result.topUp, result.balance);
  }
  return result;
}

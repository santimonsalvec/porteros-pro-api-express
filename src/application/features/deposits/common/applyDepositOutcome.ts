import type { FinalDepositStatus, Deposit } from '../../../../domain/deposits/deposit.js';
import type { NotifyOnceDependencies } from '../../bookingLifecycle/common/notifyOnce.js';
import { resolveGoalkeeperOperatingBalanceContext, type GoalkeeperOperatingBalanceContextDependencies } from '../../operatingBalance/common/goalkeeperOperatingBalanceContext.js';
import type { ApplyOutcomeResult, GatewayOutcome, IPaymentsLogger, IDepositStore } from '../../payments/common/ports.js';
import { notifyDepositOutcome } from './depositNotices.js';

export interface ApplyDepositOutcomeDependencies {
  operatingBalanceContext: GoalkeeperOperatingBalanceContextDependencies;
  store: IDepositStore;
  notices: NotifyOnceDependencies;
  logger: IPaymentsLogger;
}

const FINAL_STATUS: Record<Exclude<GatewayOutcome['status'], 'PENDING'>, FinalDepositStatus> = {
  APPROVED: 'approved',
  DECLINED: 'declined',
  VOIDED: 'voided',
  ERROR: 'error',
};

export function finalStatusOf(status: GatewayOutcome['status']): FinalDepositStatus | null {
  return status === 'PENDING' ? null : FINAL_STATUS[status];
}

/**
 * Applies a final status to a deposit (shared by the webhook and the reconciliation): resolves the
 * operating balance's owner, runs the store's transaction, warns on a mismatch and notifies a change.
 * `outcome` is the gateway's answer, or `null` for an expiry, which has no charge to compare.
 */
export async function applyDepositOutcome(
  deps: ApplyDepositOutcomeDependencies,
  deposit: Deposit,
  status: FinalDepositStatus,
  outcome: GatewayOutcome | null,
  now: Date,
): Promise<ApplyOutcomeResult> {
  const context = await resolveGoalkeeperOperatingBalanceContext(deps.operatingBalanceContext, deposit.goalkeeperId);
  if (context.kind !== 'ok') {
    // The deposit exists, so its goalkeeper had a operating balance; losing it is an operations problem.
    throw new Error(`Deposit ${deposit.id}: the goalkeeper's operating balance cannot be resolved (${context.kind})`);
  }
  const result = await deps.store.applyOutcome({
    depositId: deposit.id,
    status,
    gatewayTransactionId: outcome?.transactionId ?? null,
    charged: outcome ? { amountInCents: outcome.amountInCents, currency: outcome.currency } : null,
    owner: { goalkeeperId: context.profile.userId, currency: context.currency, invoicing: context.invoicing },
    now,
  });
  if (result.kind === 'mismatch') {
    deps.logger.warn(
      {
        outcome: 'deposit_mismatch',
        depositId: deposit.id,
        reference: deposit.reference,
        expected: { amountInCents: deposit.amount * 100, currency: deposit.currency },
        got: outcome ? { amountInCents: outcome.amountInCents, currency: outcome.currency } : null,
      },
      'Deposit not credited: the gateway charged another amount or currency',
    );
  }
  if (result.kind === 'applied') {
    deps.logger.info(
      { outcome: 'deposit_applied', depositId: deposit.id, reference: deposit.reference, status: result.deposit.status, credited: status === 'approved' },
      'Deposit outcome applied',
    );
    await notifyDepositOutcome(deps.notices, result.deposit, result.balance);
  }
  return result;
}

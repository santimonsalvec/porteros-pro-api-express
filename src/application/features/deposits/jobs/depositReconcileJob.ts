import type { Deposit } from '../../../../domain/deposits/deposit.js';
import type { IScheduledJob } from '../../events/common/ports.js';
import { checkDepositWithGateway, type CheckDepositDependencies } from '../common/checkDeposit.js';
import { GatewayUnavailableError } from '../../payments/common/ports.js';

export interface DepositReconcileDependencies extends CheckDepositDependencies {
  cap?: number;
}

type CheckResult = 'applied' | 'expired' | 'rescheduled' | 'failed';

/**
 * Asks the gateway about deposits still pending (research.md §6), for when its confirmation never
 * arrived: at 15 min, 1 h, 6 h and 24 h after creation, then expires them at 48 h. Each deposit is
 * asked through its own gateway, environment and country, whatever the country uses now. A final
 * answer is applied exactly like a confirmation; an unreachable gateway leaves the deposit for the
 * next run. One deposit failing never stops the others. Every ask is kept on the deposit (admin spec 007).
 */
export class DepositReconcileJob implements IScheduledJob {
  readonly name = 'deposit-reconcile';
  readonly leaseSeconds = 55;

  constructor(private readonly deps: DepositReconcileDependencies) {}

  async run(now: Date): Promise<string> {
    const cap = this.deps.cap ?? 200;
    const due = await this.deps.depositRepository.findDueForCheck(now, cap);
    if (due.length === cap) this.deps.logger.warn({ outcome: 'deposit_reconcile_cap_reached', cap }, 'Deposit reconciliation read its maximum');

    const counts = { checked: 0, applied: 0, expired: 0, failed: 0 };
    for (const deposit of due) {
      counts.checked += 1;
      let result: CheckResult;
      try {
        result = await this.check(deposit, now);
      } catch (error) {
        result = 'failed';
        this.deps.logger.warn(
          {
            outcome: 'deposit_reconcile_failed',
            depositId: deposit.id,
            reference: deposit.reference,
            unavailable: error instanceof GatewayUnavailableError,
            error: error instanceof Error ? error.message : String(error),
          },
          'Deposit check failed; retried next sweep',
        );
      }
      if (result === 'applied') counts.applied += 1;
      if (result === 'expired') counts.expired += 1;
      if (result === 'failed') counts.failed += 1;
    }
    if (counts.checked > 0) this.deps.logger.info({ outcome: 'deposit_reconcile', ...counts }, 'Pending deposits checked');
    return `${counts.checked} checked, ${counts.applied} applied, ${counts.expired} expired, ${counts.failed} failed`;
  }

  /** One deposit through the shared ask (admin spec 007); one a member is asking about is left for the next run. */
  private async check(deposit: Deposit, now: Date): Promise<CheckResult> {
    const checked = await checkDepositWithGateway(this.deps, deposit, now, { by: 'sweep', staffUserId: null });
    return checked.kind === 'busy' ? 'rescheduled' : checked.job;
  }
}

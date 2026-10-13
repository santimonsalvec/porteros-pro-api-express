import type { TopUp } from '../../../../domain/payments/topUp.js';
import type { IScheduledJob } from '../../events/common/ports.js';
import { checkTopUpWithGateway, type CheckTopUpDependencies } from '../common/checkTopUp.js';
import { GatewayUnavailableError } from '../common/ports.js';

export interface TopUpReconcileDependencies extends CheckTopUpDependencies {
  cap?: number;
}

type CheckResult = 'applied' | 'expired' | 'rescheduled' | 'failed';

/**
 * Asks the gateway about top-ups still pending (research.md §6), for when its confirmation never
 * arrived: at 15 min, 1 h, 6 h and 24 h after creation, then expires them at 48 h. Each top-up is
 * asked through its own gateway, environment and country, whatever the country uses now. A final
 * answer is applied exactly like a confirmation; an unreachable gateway leaves the top-up for the
 * next run. One top-up failing never stops the others. Every ask is kept on the top-up (admin spec 007).
 */
export class TopUpReconcileJob implements IScheduledJob {
  readonly name = 'top-up-reconcile';
  readonly leaseSeconds = 55;

  constructor(private readonly deps: TopUpReconcileDependencies) {}

  async run(now: Date): Promise<string> {
    const cap = this.deps.cap ?? 200;
    const due = await this.deps.topUpRepository.findDueForCheck(now, cap);
    if (due.length === cap) this.deps.logger.warn({ outcome: 'top_up_reconcile_cap_reached', cap }, 'Top-up reconciliation read its maximum');

    const counts = { checked: 0, applied: 0, expired: 0, failed: 0 };
    for (const topUp of due) {
      counts.checked += 1;
      let result: CheckResult;
      try {
        result = await this.check(topUp, now);
      } catch (error) {
        result = 'failed';
        this.deps.logger.warn(
          {
            outcome: 'top_up_reconcile_failed',
            topUpId: topUp.id,
            reference: topUp.reference,
            unavailable: error instanceof GatewayUnavailableError,
            error: error instanceof Error ? error.message : String(error),
          },
          'Top-up check failed; retried next sweep',
        );
      }
      if (result === 'applied') counts.applied += 1;
      if (result === 'expired') counts.expired += 1;
      if (result === 'failed') counts.failed += 1;
    }
    if (counts.checked > 0) this.deps.logger.info({ outcome: 'top_up_reconcile', ...counts }, 'Pending top-ups checked');
    return `${counts.checked} checked, ${counts.applied} applied, ${counts.expired} expired, ${counts.failed} failed`;
  }

  /** One top-up through the shared ask (admin spec 007); one a member is asking about is left for the next run. */
  private async check(topUp: TopUp, now: Date): Promise<CheckResult> {
    const checked = await checkTopUpWithGateway(this.deps, topUp, now, { by: 'sweep', staffUserId: null });
    return checked.kind === 'busy' ? 'rescheduled' : checked.job;
  }
}

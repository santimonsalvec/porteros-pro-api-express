import type { LedgerOwner } from '../../operatingBalance/common/operatingBalanceLedger.js';
import {
  resolveGoalkeeperOperatingBalanceContext,
  type GoalkeeperOperatingBalanceContextDependencies,
} from '../../operatingBalance/common/goalkeeperOperatingBalanceContext.js';
import type { ILifecycleLogger } from './ports.js';

/**
 * Adds the goalkeeper's ledger owner to `owners`, as every cancellation that refunds needs it
 * (017, admin 006). False when their operating balance can't be resolved (a configuration gap): the caller
 * answers "temporarily unavailable" and changes nothing.
 */
export async function addLedgerOwner(
  deps: { operatingBalanceContext: GoalkeeperOperatingBalanceContextDependencies; logger: ILifecycleLogger },
  owners: Map<string, LedgerOwner>,
  goalkeeperId: string,
  outcome: string,
): Promise<boolean> {
  const context = await resolveGoalkeeperOperatingBalanceContext(deps.operatingBalanceContext, goalkeeperId);
  if (context.kind !== 'ok') {
    deps.logger.warn({ outcome, goalkeeperId, reason: context.kind }, 'Refund owner unresolved');
    return false;
  }
  owners.set(goalkeeperId, { goalkeeperId, currency: context.currency, invoicing: context.invoicing });
  return true;
}

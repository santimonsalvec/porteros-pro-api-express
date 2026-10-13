import type { LedgerOwner } from '../../wallet/common/walletLedger.js';
import {
  resolveGoalkeeperWalletContext,
  type GoalkeeperWalletContextDependencies,
} from '../../wallet/common/goalkeeperWalletContext.js';
import type { ILifecycleLogger } from './ports.js';

/**
 * Adds the goalkeeper's ledger owner to `owners`, as every cancellation that refunds needs it
 * (017, admin 006). False when their wallet can't be resolved (a configuration gap): the caller
 * answers "temporarily unavailable" and changes nothing.
 */
export async function addLedgerOwner(
  deps: { walletContext: GoalkeeperWalletContextDependencies; logger: ILifecycleLogger },
  owners: Map<string, LedgerOwner>,
  goalkeeperId: string,
  outcome: string,
): Promise<boolean> {
  const context = await resolveGoalkeeperWalletContext(deps.walletContext, goalkeeperId);
  if (context.kind !== 'ok') {
    deps.logger.warn({ outcome, goalkeeperId, reason: context.kind }, 'Refund owner unresolved');
    return false;
  }
  owners.set(goalkeeperId, { goalkeeperId, currency: context.currency, invoicing: context.invoicing });
  return true;
}

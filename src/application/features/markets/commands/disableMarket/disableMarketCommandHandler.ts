import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IAdminMarketRepository } from '../../common/ports.js';
import { DisableMarketCommand, type DisableMarketResult } from './disableMarketCommand.js';

export interface DisableMarketDependencies {
  markets: Pick<IAdminMarketRepository, 'getById' | 'update'>;
  clock: IClock;
}

export class DisableMarketCommandHandler implements ICommandHandler<DisableMarketCommand, DisableMarketResult> {
  constructor(private readonly deps: DisableMarketDependencies) {}

  async handle({ marketId, revision, reason, disabledBy }: DisableMarketCommand): Promise<DisableMarketResult> {
    const market = await this.deps.markets.getById(marketId);
    if (!market) return { outcome: 'not_found' };
    if (!reason || reason.trim() === '') return { outcome: 'reason_required' };
    if (market.revision !== revision) return { outcome: 'stale' };
    if (market.status !== 'enabled') return { outcome: 'not_enabled' };

    const saved = await this.deps.markets.update(market.disable(disabledBy, this.deps.clock.now()), revision);
    return saved === 'saved' ? { outcome: 'disabled' } : { outcome: 'stale' };
  }
}

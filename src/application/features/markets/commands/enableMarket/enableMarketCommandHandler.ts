import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IReadinessSummary } from '../../../geography/common/ports.js';
import type { IAdminMarketRepository } from '../../common/ports.js';
import { EnableMarketCommand, type EnableMarketResult } from './enableMarketCommand.js';

export interface EnableMarketDependencies {
  markets: Pick<IAdminMarketRepository, 'getById' | 'update'>;
  readiness: Pick<IReadinessSummary, 'check'>;
  clock: IClock;
}

export class EnableMarketCommandHandler implements ICommandHandler<EnableMarketCommand, EnableMarketResult> {
  constructor(private readonly deps: EnableMarketDependencies) {}

  async handle({ marketId, revision, enabledBy }: EnableMarketCommand): Promise<EnableMarketResult> {
    const market = await this.deps.markets.getById(marketId);
    if (!market) return { outcome: 'not_found' };
    if (market.revision !== revision) return { outcome: 'stale' };
    if (market.status === 'enabled') return { outcome: 'already_enabled' };

    const readiness = await this.deps.readiness.check(market);
    if (!readiness.ready) return { outcome: 'not_ready', items: readiness.items.filter((item) => item.status === 'missing') };

    const saved = await this.deps.markets.update(market.enable(enabledBy, this.deps.clock.now()), revision);
    return saved === 'saved' ? { outcome: 'enabled' } : { outcome: 'stale' };
  }
}

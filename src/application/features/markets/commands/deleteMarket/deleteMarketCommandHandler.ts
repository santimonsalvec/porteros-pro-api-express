import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IMarketUsage } from '../../common/marketUsage.js';
import type { IAdminMarketRepository } from '../../common/ports.js';
import { DeleteMarketCommand, type DeleteMarketResult } from './deleteMarketCommand.js';

export interface DeleteMarketDependencies {
  markets: Pick<IAdminMarketRepository, 'getById' | 'delete'>;
  marketUsage: IMarketUsage;
}

export class DeleteMarketCommandHandler implements ICommandHandler<DeleteMarketCommand, DeleteMarketResult> {
  constructor(private readonly deps: DeleteMarketDependencies) {}

  async handle({ marketId, revision }: DeleteMarketCommand): Promise<DeleteMarketResult> {
    const market = await this.deps.markets.getById(marketId);
    if (!market) return { outcome: 'not_found' };
    if (market.revision !== revision) return { outcome: 'stale' };

    const usage = await this.deps.marketUsage.marketUsage(marketId);
    if (usage) return { outcome: 'in_use', ...usage };

    const deleted = await this.deps.markets.delete(marketId, revision);
    if (deleted === 'deleted') return { outcome: 'deleted' };
    return deleted === 'stale' ? { outcome: 'stale' } : { outcome: 'not_found' };
  }
}

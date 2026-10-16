import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IReadinessSummary } from '../../../geography/common/ports.js';
import type { IMarketRepository } from '../../common/ports.js';
import { GetMarketReadinessQuery, type GetMarketReadinessResult } from './getMarketReadinessQuery.js';

export class GetMarketReadinessQueryHandler implements IQueryHandler<GetMarketReadinessQuery, GetMarketReadinessResult> {
  constructor(private readonly deps: { markets: Pick<IMarketRepository, 'getById'>; readiness: Pick<IReadinessSummary, 'check'> }) {}

  async handle({ marketId }: GetMarketReadinessQuery): Promise<GetMarketReadinessResult> {
    const market = await this.deps.markets.getById(marketId);
    if (!market) return { outcome: 'not_found' };
    return { outcome: 'ok', readiness: await this.deps.readiness.check(market) };
  }
}

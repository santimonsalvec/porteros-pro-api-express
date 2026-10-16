import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminZoneRepository } from '../../common/ports.js';
import type { IAdminMarketRepository } from '../../../markets/common/ports.js';
import { toZoneShape } from '../../common/views.js';
import { checkZoneMarket } from '../../common/zoneChecks.js';
import { ListZoneShapesQuery, type ListZoneShapesResult } from './listZoneShapesQuery.js';

export class ListZoneShapesQueryHandler implements IQueryHandler<ListZoneShapesQuery, ListZoneShapesResult> {
  constructor(private readonly deps: { markets: Pick<IAdminMarketRepository, 'getById'>; zones: IAdminZoneRepository }) {}

  async handle(query: ListZoneShapesQuery): Promise<ListZoneShapesResult> {
    const market = await checkZoneMarket(this.deps.markets, query.marketId);
    if (market.outcome !== 'ok') return market;
    return { outcome: 'ok', items: (await this.deps.zones.listByMarket(query.marketId)).map(toZoneShape) };
  }
}

import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminZoneRepository, IReferenceUsage } from '../../common/ports.js';
import type { IAdminMarketRepository } from '../../../markets/common/ports.js';
import { toZoneListItems } from '../../common/views.js';
import { checkZoneMarket } from '../../common/zoneChecks.js';
import { ListZonesQuery, type ListZonesResult } from './listZonesQuery.js';

export class ListZonesQueryHandler implements IQueryHandler<ListZonesQuery, ListZonesResult> {
  constructor(private readonly deps: { markets: Pick<IAdminMarketRepository, 'getById'>; zones: IAdminZoneRepository; usage: IReferenceUsage }) {}

  async handle(query: ListZonesQuery): Promise<ListZonesResult> {
    const market = await checkZoneMarket(this.deps.markets, query.marketId);
    if (market.outcome !== 'ok') return market;
    const items = await toZoneListItems(await this.deps.zones.summariesByMarkets([query.marketId]), this.deps.usage);
    return { outcome: 'ok', market: { id: market.market.id, name: market.market.name }, items };
  }
}

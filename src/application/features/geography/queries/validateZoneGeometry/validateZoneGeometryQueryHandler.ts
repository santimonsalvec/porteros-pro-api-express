import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminZoneRepository } from '../../common/ports.js';
import type { IAdminMarketRepository } from '../../../markets/common/ports.js';
import { checkZoneMarket, reviewZoneGeometry } from '../../common/zoneChecks.js';
import { ValidateZoneGeometryQuery, type ValidateZoneGeometryResult } from './validateZoneGeometryQuery.js';

export class ValidateZoneGeometryQueryHandler implements IQueryHandler<ValidateZoneGeometryQuery, ValidateZoneGeometryResult> {
  constructor(private readonly deps: { markets: Pick<IAdminMarketRepository, 'getById' | 'getByIds'>; zones: IAdminZoneRepository }) {}

  async handle(query: ValidateZoneGeometryQuery): Promise<ValidateZoneGeometryResult> {
    const market = await checkZoneMarket(this.deps.markets, query.marketId);
    if (market.outcome !== 'ok') return market;
    const review = await reviewZoneGeometry(this.deps, query.geometry, query.zoneId, query.active);
    return { outcome: 'ok', ...review };
  }
}

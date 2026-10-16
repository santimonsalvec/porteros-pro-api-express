import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IMarketRepository } from '../../../markets/common/ports.js';
import type { IZoneRepository } from '../../common/ports.js';
import { GetZonesByMarketQuery, type GetZonesByMarketResult, type ZoneOption } from './getZonesByMarketQuery.js';

export class GetZonesByMarketQueryHandler implements IQueryHandler<GetZonesByMarketQuery, GetZonesByMarketResult> {
  constructor(
    private readonly marketRepository: Pick<IMarketRepository, 'getById'>,
    private readonly zoneRepository: IZoneRepository,
  ) {}

  async handle(query: GetZonesByMarketQuery): Promise<GetZonesByMarketResult> {
    const market = await this.marketRepository.getById(query.marketId);
    if (!market || market.status !== 'enabled') return { outcome: 'market_not_found' };

    const zones = await this.zoneRepository.getActiveByMarketId(market.id);
    if (zones.length === 0) return { outcome: 'no_zones_configured' };

    const options: ZoneOption[] = zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      slug: zone.slug,
      displayOrder: zone.displayOrder,
      geometry: zone.geometry,
    }));
    return { outcome: 'success', zones: options };
  }
}

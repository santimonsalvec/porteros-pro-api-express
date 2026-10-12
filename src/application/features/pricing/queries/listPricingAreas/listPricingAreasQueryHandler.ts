import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { PricingGeography, type PricingGeographyDependencies } from '../../common/pricingGeography.js';
import { ListPricingAreasQuery, type PricingAreas } from './listPricingAreasQuery.js';

export class ListPricingAreasQueryHandler implements IQueryHandler<ListPricingAreasQuery, PricingAreas> {
  constructor(private readonly deps: PricingGeographyDependencies) {}

  async handle(_query: ListPricingAreasQuery): Promise<PricingAreas> {
    const geography = await PricingGeography.load(this.deps);
    return {
      countries: geography.countries().map((country) => ({ id: country.id, name: country.name, currency: country.currency })),
      cities: geography.zoneOwners().map((city) => ({
        id: city.id,
        name: city.name,
        countryId: geography.countryOf(city.id)?.id ?? null,
        zones: geography.zones(city.id).map((zone) => ({ id: zone.id, name: zone.name, active: zone.active })),
      })),
    };
  }
}

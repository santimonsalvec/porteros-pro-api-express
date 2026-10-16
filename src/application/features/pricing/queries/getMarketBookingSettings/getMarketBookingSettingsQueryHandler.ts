import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { cityPart, EMPTY_SETTINGS, effectiveRules } from '../../common/bookingRules.js';
import type { PricingGeographyDependencies } from '../../common/pricingGeography.js';
import type { IBookingSettingsAdmin } from '../../common/ports.js';
import { GetCityBookingSettingsQuery, type GetCityBookingSettingsResult } from './getCityBookingSettingsQuery.js';

export class GetCityBookingSettingsQueryHandler implements IQueryHandler<GetCityBookingSettingsQuery, GetCityBookingSettingsResult> {
  constructor(private readonly deps: PricingGeographyDependencies & { bookingSettings: IBookingSettingsAdmin }) {}

  async handle({ cityId }: GetCityBookingSettingsQuery): Promise<GetCityBookingSettingsResult> {
    const city = await this.deps.cities.getById(cityId);
    if (!city) return { outcome: 'not_found' };
    if (city.zoneCityId !== null) return { outcome: 'city_not_anchor', anchorCityId: city.zoneCityId };
    const countryId = (await this.deps.regions.getById(city.regionId))?.countryId ?? null;
    const [country, own, inherited] = await Promise.all([
      countryId ? this.deps.countries.getById(countryId) : null,
      this.deps.bookingSettings.getByScope('city', cityId),
      countryId ? this.deps.bookingSettings.getByScope('country', countryId) : null,
    ]);
    return {
      outcome: 'ok',
      settings: {
        cityId,
        cityName: city.name,
        countryId,
        countryName: country?.name ?? null,
        currency: country?.currency ?? null,
        own: cityPart(own?.fields ?? EMPTY_SETTINGS),
        country: cityPart(inherited?.fields ?? EMPTY_SETTINGS),
        effective: effectiveRules(own, inherited),
        invalid: own?.invalid ?? false,
        revision: own?.revision ?? null,
      },
    };
  }
}

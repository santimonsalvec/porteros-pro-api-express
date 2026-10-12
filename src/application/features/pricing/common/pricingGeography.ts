import type { Country } from '../../../../domain/countries/country.js';
import type { City } from '../../../../domain/locations/city.js';
import type {
  IAdminCityRepository,
  IAdminCountryRepository,
  IAdminRegionRepository,
  IAdminZoneRepository,
  ZoneSummary,
} from '../../geography/common/ports.js';
import type { PriceTarget } from './views.js';

export interface PricingGeographyDependencies {
  countries: IAdminCountryRepository;
  regions: IAdminRegionRepository;
  cities: IAdminCityRepository;
  zones: IAdminZoneRepository;
}

const NO_TARGET: PriceTarget = {
  valid: false,
  countryId: null,
  countryName: null,
  currency: null,
  cityId: null,
  cityName: null,
  zoneId: null,
  zoneName: null,
  zoneActive: null,
};

/**
 * The geography prices hang from, read once per request (admin spec 004): every city that owns
 * zones plus the ones asked for, their zones without polygons, their regions and countries. A few
 * dozen cities and a few hundred zones, so lists join and sort in memory.
 */
export class PricingGeography {
  private readonly zoneById: Map<string, ZoneSummary>;

  private constructor(
    private readonly cityById: Map<string, City>,
    private readonly countryOfRegion: Map<string, string | null>,
    private readonly countryById: Map<string, Country>,
    private readonly zonesOfCity: Map<string, ZoneSummary[]>,
  ) {
    this.zoneById = new Map([...zonesOfCity.values()].flat().map((zone) => [zone.id, zone]));
  }

  static async load(deps: PricingGeographyDependencies, cityIds: readonly string[] = []): Promise<PricingGeography> {
    const ownerIds = await deps.zones.zoneOwnerIds();
    const ids = [...new Set([...ownerIds, ...cityIds])];
    const [cities, zones] = await Promise.all([deps.cities.getByIds(ids), deps.zones.summariesByCities(ids)]);
    const regions = await deps.regions.getByIds([...new Set(cities.map((city) => city.regionId))]);
    const countries = await deps.countries.getByIds([...new Set(regions.flatMap((region) => region.countryId ?? []))]);
    const zonesOfCity = new Map<string, ZoneSummary[]>();
    for (const zone of zones) zonesOfCity.set(zone.cityId, [...(zonesOfCity.get(zone.cityId) ?? []), zone]);
    return new PricingGeography(
      new Map(cities.map((city) => [city.id, city])),
      new Map(regions.map((region) => [region.id, region.countryId])),
      new Map(countries.map((country) => [country.id, country])),
      zonesOfCity,
    );
  }

  /** The countries read here, by name. */
  countries(): Country[] {
    return [...this.countryById.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  /** The cities read here that own zones, by name. */
  zoneOwners(): City[] {
    return [...this.cityById.values()].filter((city) => this.zones(city.id).length > 0).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  zones(cityId: string): ZoneSummary[] {
    return this.zonesOfCity.get(cityId) ?? [];
  }

  zone(zoneId: string): ZoneSummary | null {
    return this.zoneById.get(zoneId) ?? null;
  }

  city(cityId: string): City | null {
    return this.cityById.get(cityId) ?? null;
  }

  /** The anchor cities read here that belong to the country. */
  citiesOf(countryId: string): City[] {
    return [...this.cityById.values()].filter((city) => city.zoneCityId === null && this.countryOf(city.id)?.id === countryId);
  }

  countryOf(cityId: string): Country | null {
    const city = this.cityById.get(cityId);
    const countryId = city ? this.countryOfRegion.get(city.regionId) : null;
    return countryId ? (this.countryById.get(countryId) ?? null) : null;
  }

  /** The country, anchor city and zone of a price document. */
  target(scope: string, refId: string): PriceTarget {
    if (scope === 'country') {
      const country = this.countryById.get(refId);
      return country ? { ...NO_TARGET, valid: true, ...countryPart(country) } : NO_TARGET;
    }
    const zone = scope === 'zone' ? this.zone(refId) : null;
    if (scope === 'zone' && !zone) return NO_TARGET;
    const city = this.city(zone?.cityId ?? refId);
    if (!city) return NO_TARGET;
    const country = this.countryOf(city.id);
    return {
      valid: city.zoneCityId === null,
      ...(country ? countryPart(country) : { countryId: null, countryName: null, currency: null }),
      cityId: city.id,
      cityName: city.name,
      zoneId: zone?.id ?? null,
      zoneName: zone?.name ?? null,
      zoneActive: zone?.active ?? null,
    };
  }
}

function countryPart(country: Country) {
  return { countryId: country.id, countryName: country.name, currency: country.currency };
}

/** Why a price cannot point at a target. */
export type TargetFailure =
  | { outcome: 'zone_not_found' | 'city_not_found' | 'country_not_found' | 'country_without_currency' }
  | { outcome: 'city_not_anchor'; anchorCityId: string };

/**
 * Whether a new price may point at this target: it exists, a city is an anchor (prices of a city
 * that uses another's zones are its anchor's), and its country has a currency to price in.
 * `null` when it may.
 */
export async function checkWriteTarget(deps: PricingGeographyDependencies, scope: string, refId: string): Promise<TargetFailure | null> {
  if (scope === 'country') {
    const country = await deps.countries.getById(refId);
    if (!country) return { outcome: 'country_not_found' };
    return country.currency ? null : { outcome: 'country_without_currency' };
  }
  const zone = scope === 'zone' ? await deps.zones.getById(refId) : null;
  if (scope === 'zone' && !zone) return { outcome: 'zone_not_found' };
  const city = await deps.cities.getById(zone?.cityId ?? refId);
  if (!city) return { outcome: 'city_not_found' };
  if (city.zoneCityId !== null) return { outcome: 'city_not_anchor', anchorCityId: city.zoneCityId };
  const countryId = (await deps.regions.getById(city.regionId))?.countryId ?? null;
  const country = countryId ? await deps.countries.getById(countryId) : null;
  return country?.currency ? null : { outcome: 'country_without_currency' };
}

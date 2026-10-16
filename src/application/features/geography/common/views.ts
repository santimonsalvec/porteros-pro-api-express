import type { Country } from '../../../../domain/countries/country.js';
import type { City } from '../../../../domain/locations/city.js';
import type { Region } from '../../../../domain/locations/region.js';
import { isInvoiceableDocumentType, type DocumentType } from '../../../../domain/goalkeepers/documentType.js';
import type { MatchSurface } from '../../../../domain/pricing/matchSurface.js';
import type { Zone, ZoneGeometry } from '../../../../domain/zones/zone.js';
import { previewGeometry, validateZoneGeometry } from '../../../../domain/zones/zoneGeometry.js';
import type { IAdminCityRepository, IAdminCountryRepository, IAdminRegionRepository, IReferenceUsage, ZoneSummary } from './ports.js';

/** A list page as every admin list answers it. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function pageOf<T>(items: T[], page: number, pageSize: number, totalItems: number): Page<T> {
  return { items, page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) };
}

/** A municipality as the admin shows it (billing catalog, spec 031). */
export interface CityView {
  id: string;
  name: string;
  region: { id: string; name: string };
  country: { id: string; name: string; countryCode: string } | null;
  daneStateCode: string | null;
  daneCityCode: string | null;
  revision: number;
}

export interface CityViewDependencies {
  cities: IAdminCityRepository;
  regions: IAdminRegionRepository;
  countries: IAdminCountryRepository;
}

const unique = (values: (string | null)[]) => [...new Set(values.filter((value): value is string => value !== null))];

/** The views of several municipalities, reading their regions and countries once. */
export async function toCityViews(cities: City[], deps: CityViewDependencies): Promise<CityView[]> {
  const regions = await deps.regions.getByIds(unique(cities.map((city) => city.regionId)));
  const countries = await deps.countries.getByIds(unique(regions.map((region) => region.countryId)));
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const countryById = new Map(countries.map((country) => [country.id, country]));

  return cities.map((city) => {
    const region = regionById.get(city.regionId);
    const country = region?.countryId ? countryById.get(region.countryId) : undefined;
    return {
      id: city.id,
      name: city.name,
      region: { id: city.regionId, name: region?.name ?? '' },
      country: country ? { id: country.id, name: country.name, countryCode: country.countryCode } : null,
      daneStateCode: city.daneStateCode,
      daneCityCode: city.daneCityCode,
      revision: city.revision,
    };
  });
}

/** A zone as the admin shows it (contracts/geography-api.md). */
export interface ZoneView {
  id: string;
  marketId: string;
  name: string;
  slug: string;
  active: boolean;
  displayOrder: number;
  geometry: ZoneGeometry;
  /** False for a seeded polygon the admin's rules reject: it is listed, marked, to be fixed. */
  geometryValid: boolean;
  /** Goalkeepers or bookings point at it: redrawing it asks for a reason. */
  inUse: boolean;
  revision: number;
}

export async function toZoneViews(zones: Zone[], usage: IReferenceUsage): Promise<ZoneView[]> {
  const inUse = await usage.zonesInUse(zones.map((zone) => zone.id));
  return zones.map((zone) => ({
    id: zone.id,
    marketId: zone.marketId,
    name: zone.name,
    slug: zone.slug,
    active: zone.active,
    displayOrder: zone.displayOrder,
    geometry: zone.geometry,
    geometryValid: validateZoneGeometry(zone.geometry).length === 0,
    inUse: inUse.has(zone.id),
    revision: zone.revision,
  }));
}

/** A country as the admin shows it; `operating` locks its currency (clarification 3). */
export interface CountryView {
  id: string;
  name: string;
  countryCode: string;
  dialCode: string;
  currency: string | null;
  regionCount: number;
  operating: boolean;
  revision: number;
}

export async function toCountryViews(
  countries: Country[],
  deps: { regions: IAdminRegionRepository; usage: IReferenceUsage },
): Promise<CountryView[]> {
  const regionCounts = await deps.regions.countByCountry(countries.map((country) => country.id));
  return Promise.all(
    countries.map(async (country) => ({
      id: country.id,
      name: country.name,
      countryCode: country.countryCode,
      dialCode: country.dialCode,
      currency: country.currency,
      regionCount: regionCounts.get(country.id) ?? 0,
      operating: await deps.usage.countryOperates(country.id),
      revision: country.revision,
    })),
  );
}

export interface RegionView {
  id: string;
  name: string;
  countryId: string | null;
  countryName: string | null;
  cityCount: number;
  revision: number;
}

export async function toRegionViews(
  regions: Region[],
  deps: { countries: IAdminCountryRepository; cities: IAdminCityRepository },
): Promise<RegionView[]> {
  const countryIds = [...new Set(regions.flatMap((region) => (region.countryId ? [region.countryId] : [])))];
  const [countries, cityCounts] = await Promise.all([deps.countries.getByIds(countryIds), deps.cities.countByRegion(regions.map((region) => region.id))]);
  const countryName = new Map(countries.map((country) => [country.id, country.name]));
  return regions.map((region) => ({
    id: region.id,
    name: region.name,
    countryId: region.countryId,
    countryName: region.countryId ? (countryName.get(region.countryId) ?? null) : null,
    cityCount: cityCounts.get(region.id) ?? 0,
    revision: region.revision,
  }));
}

export interface DocumentTypeView {
  id: string;
  code: string;
  name: string;
  /** The invoicing provider accepts its code. */
  invoiceable: boolean;
  /** Goalkeepers store its code: the code can no longer change. */
  inUse: boolean;
  revision: number;
}

export async function toDocumentTypeViews(types: DocumentType[], usage: IReferenceUsage): Promise<DocumentTypeView[]> {
  const inUse = await usage.documentTypesInUse(types.map((type) => type.code));
  return types.map((type) => ({
    id: type.id,
    code: type.code,
    name: type.name,
    invoiceable: isInvoiceableDocumentType(type.code),
    inUse: inUse.has(type.code),
    revision: type.revision,
  }));
}

export interface MatchSurfaceView {
  id: string;
  name: string;
  active: boolean;
  order: number;
  inUse: boolean;
  revision: number;
}

export async function toMatchSurfaceViews(surfaces: MatchSurface[], usage: IReferenceUsage): Promise<MatchSurfaceView[]> {
  const inUse = await usage.surfacesInUse(surfaces.map((surface) => surface.id));
  return surfaces.map((surface) => ({
    id: surface.id,
    name: surface.name,
    active: surface.active,
    order: surface.order,
    inUse: inUse.has(surface.id),
    revision: surface.revision,
  }));
}

/** A zone in its city's list: no polygon (they weigh up to ~300 KB each). */
export type ZoneListItem = ZoneSummary & {
  /** Goalkeepers or bookings point at it: redrawing it asks for a reason. */
  inUse: boolean;
};

export async function toZoneListItems(zones: ZoneSummary[], usage: IReferenceUsage): Promise<ZoneListItem[]> {
  const inUse = await usage.zonesInUse(zones.map((zone) => zone.id));
  return zones.map((zone) => ({ ...zone, inUse: inUse.has(zone.id) }));
}

/** A zone as the map draws it: a lighter polygon (`previewGeometry`), never used to save. */
export interface ZoneShape {
  id: string;
  name: string;
  active: boolean;
  geometry: ZoneGeometry;
  geometryValid: boolean;
}

export function toZoneShape(zone: Zone): ZoneShape {
  return {
    id: zone.id,
    name: zone.name,
    active: zone.active,
    geometry: previewGeometry(zone.geometry),
    geometryValid: validateZoneGeometry(zone.geometry).length === 0,
  };
}

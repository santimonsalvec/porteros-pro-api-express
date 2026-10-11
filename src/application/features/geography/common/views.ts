import type { Country } from '../../../../domain/countries/country.js';
import type { City } from '../../../../domain/locations/city.js';
import type { Region } from '../../../../domain/locations/region.js';
import { isInvoiceableDocumentType, type DocumentType } from '../../../../domain/goalkeepers/documentType.js';
import type { MatchSurface } from '../../../../domain/pricing/matchSurface.js';
import type { Zone, ZoneGeometry } from '../../../../domain/zones/zone.js';
import { previewGeometry, validateZoneGeometry } from '../../../../domain/zones/zoneGeometry.js';
import type {
  IAdminCityRepository,
  IAdminCountryRepository,
  IAdminRegionRepository,
  IAdminZoneRepository,
  IReadinessSummary,
  IReferenceUsage,
  ReadinessSummary,
  ZoneSummary,
} from './ports.js';
import { isSupportedTimeZone } from './timeZones.js';

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

export type CityState = 'operating' | 'available';

/** A city as the admin shows it (contracts/geography-api.md). */
export interface CityView {
  id: string;
  name: string;
  region: { id: string; name: string };
  country: { id: string; name: string; countryCode: string } | null;
  timeZone: string | null;
  /** False for a stored name the city form would not accept (an alias, a typo). */
  timeZoneValid: boolean;
  daneStateCode: string | null;
  daneCityCode: string | null;
  zoneCity: { id: string; name: string } | null;
  zoneCount: number;
  satelliteCount: number;
  state: CityState;
  /** Only operating cities have a checklist. */
  readiness: ReadinessSummary | null;
  revision: number;
}

export interface CityViewDependencies {
  cities: IAdminCityRepository;
  regions: IAdminRegionRepository;
  countries: IAdminCountryRepository;
  zones: IAdminZoneRepository;
  readiness: IReadinessSummary;
}

const unique = (values: (string | null)[]) => [...new Set(values.filter((value): value is string => value !== null))];

/** Operating: it uses an anchor's zones, or has zones of its own (clarification 2). */
export function cityState(city: City, zoneCount: number): CityState {
  return city.zoneCityId !== null || zoneCount > 0 ? 'operating' : 'available';
}

/**
 * The views of several cities, reading their related records once. `withReadiness` adds the
 * checklist summary of the operating ones (one batch, the costliest part): only the list asks it.
 */
export async function toCityViews(cities: City[], deps: CityViewDependencies, withReadiness = true): Promise<CityView[]> {
  const ids = cities.map((city) => city.id);
  const [regions, anchors, zoneCounts, satelliteCounts] = await Promise.all([
    deps.regions.getByIds(unique(cities.map((city) => city.regionId))),
    deps.cities.getByIds(unique(cities.map((city) => city.zoneCityId))),
    deps.zones.countByCity(ids),
    deps.cities.countSatellites(ids),
  ]);
  const countries = await deps.countries.getByIds(unique(regions.map((region) => region.countryId)));
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const countryById = new Map(countries.map((country) => [country.id, country]));
  const anchorById = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  const operating = cities.filter((city) => cityState(city, zoneCounts.get(city.id) ?? 0) === 'operating');
  const summaries = withReadiness && operating.length > 0 ? await deps.readiness.summarize(operating) : new Map<string, ReadinessSummary>();

  return cities.map((city) => {
    const region = regionById.get(city.regionId);
    const country = region?.countryId ? countryById.get(region.countryId) : undefined;
    const anchor = city.zoneCityId ? anchorById.get(city.zoneCityId) : undefined;
    const zoneCount = zoneCounts.get(city.id) ?? 0;
    return {
      id: city.id,
      name: city.name,
      region: { id: city.regionId, name: region?.name ?? '' },
      country: country ? { id: country.id, name: country.name, countryCode: country.countryCode } : null,
      timeZone: city.timeZone,
      timeZoneValid: city.timeZone === null || isSupportedTimeZone(city.timeZone),
      daneStateCode: city.daneStateCode,
      daneCityCode: city.daneCityCode,
      zoneCity: city.zoneCityId ? { id: city.zoneCityId, name: anchor?.name ?? '' } : null,
      zoneCount,
      satelliteCount: satelliteCounts.get(city.id) ?? 0,
      state: cityState(city, zoneCount),
      readiness: summaries.get(city.id) ?? null,
      revision: city.revision,
    };
  });
}

/** A zone as the admin shows it (contracts/geography-api.md). */
export interface ZoneView {
  id: string;
  cityId: string;
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
    cityId: zone.cityId,
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

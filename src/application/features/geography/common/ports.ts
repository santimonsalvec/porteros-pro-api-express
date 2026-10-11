import type { Country } from '../../../../domain/countries/country.js';
import type { BookingSettings } from '../../../../domain/pricing/bookingSettings.js';
import type { DocumentType } from '../../../../domain/goalkeepers/documentType.js';
import type { City } from '../../../../domain/locations/city.js';
import type { Region } from '../../../../domain/locations/region.js';
import type { MatchSurface } from '../../../../domain/pricing/matchSurface.js';
import type { Zone } from '../../../../domain/zones/zone.js';

/**
 * The admin's write side of the reference data (spec 003 of the admin). Separate from the
 * read-only ports the app uses (`ICityRepository`, `IZoneRepository`…), which stay narrow.
 * Every `update` is optimistic: it writes only when the stored `revision` still equals the
 * entity's, and bumps it (research §5).
 */

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Found<T> {
  items: T[];
  totalItems: number;
}

/** `stale`: the document changed (or disappeared) since it was read. */
export type UpdateResult = 'saved' | 'stale';

export interface IAdminCountryRepository {
  list(query: PageRequest & { q?: string }): Promise<Found<Country>>;
  getById(id: string): Promise<Country | null>;
  getByIds(ids: string[]): Promise<Country[]>;
  /** Case-insensitive. */
  findByCode(countryCode: string): Promise<Country | null>;
  create(country: Country): Promise<void>;
  update(country: Country): Promise<UpdateResult>;
  delete(id: string): Promise<boolean>;
}

export interface IAdminRegionRepository {
  list(query: PageRequest & { countryId?: string; q?: string }): Promise<Found<Region>>;
  getById(id: string): Promise<Region | null>;
  getByIds(ids: string[]): Promise<Region[]>;
  getByCountry(countryId: string): Promise<Region[]>;
  /** Regions per country id. */
  countByCountry(countryIds: string[]): Promise<Map<string, number>>;
  create(region: Region): Promise<void>;
  update(region: Region): Promise<UpdateResult>;
  delete(id: string): Promise<boolean>;
}

export interface CityListQuery extends PageRequest {
  /** Only cities of these regions (a country is resolved to its regions by the caller). */
  regionIds?: string[];
  q?: string;
  /** `true`: cities that own their zones (`zoneCityId = null`); `false`: satellites. */
  anchor?: boolean;
  /** Needs `zoneOwnerIds`: operating = a satellite or a city with zones of its own. */
  state?: 'operating' | 'available';
  /** The cities that have at least one zone (any state), from the zones collection. */
  zoneOwnerIds?: string[];
}

export interface IAdminCityRepository {
  list(query: CityListQuery): Promise<Found<City>>;
  getById(id: string): Promise<City | null>;
  getByIds(ids: string[]): Promise<City[]>;
  /** Satellites per anchor id. */
  countSatellites(anchorIds: string[]): Promise<Map<string, number>>;
  /** Cities per region id. */
  countByRegion(regionIds: string[]): Promise<Map<string, number>>;
  create(city: City): Promise<void>;
  update(city: City): Promise<UpdateResult>;
  delete(id: string): Promise<boolean>;
}

/** A zone without its polygon. */
export interface ZoneSummary {
  id: string;
  cityId: string;
  name: string;
  slug: string;
  active: boolean;
  displayOrder: number;
  revision: number;
}

export interface IAdminZoneRepository {
  /** Every zone of the city, active or not, by `displayOrder` then id. */
  listByCity(cityId: string): Promise<Zone[]>;
  /**
   * The zones of several cities without their polygons, in one read: the lists and the readiness.
   * Real polygons weigh up to ~300 KB each, so they are read only where they are drawn.
   */
  summariesByCities(cityIds: string[]): Promise<ZoneSummary[]>;
  getById(id: string): Promise<Zone | null>;
  findBySlug(slug: string): Promise<Zone | null>;
  /** Zones per city id (any state). */
  countByCity(cityIds: string[]): Promise<Map<string, number>>;
  /** Every city id that has at least one zone (any state). */
  zoneOwnerIds(): Promise<string[]>;
  create(zone: Zone): Promise<void>;
  update(zone: Zone): Promise<UpdateResult>;
  delete(id: string): Promise<boolean>;
}

export interface IAdminDocumentTypeRepository {
  list(query: PageRequest & { q?: string }): Promise<Found<DocumentType>>;
  getById(id: string): Promise<DocumentType | null>;
  findByCode(code: string): Promise<DocumentType | null>;
  create(documentType: DocumentType): Promise<void>;
  update(documentType: DocumentType): Promise<UpdateResult>;
  delete(id: string): Promise<boolean>;
}

export interface IAdminMatchSurfaceRepository {
  list(query: PageRequest & { active?: boolean }): Promise<Found<MatchSurface>>;
  getById(id: string): Promise<MatchSurface | null>;
  create(surface: MatchSurface): Promise<void>;
  update(surface: MatchSurface): Promise<UpdateResult>;
  delete(id: string): Promise<boolean>;
}

/** Why a reference document cannot be deleted (or its key changed): the first use found. */
export type UsageReason =
  | 'region_has_cities'
  | 'city_has_zones'
  | 'city_is_anchor'
  | 'city_in_use'
  | 'zone_in_use'
  | 'document_type_in_use'
  | 'surface_in_use';

/** Looks across the collections that point at reference data (research §8 and §9). */
export interface IReferenceUsage {
  regionUsage(regionId: string): Promise<UsageReason | null>;
  cityUsage(cityId: string): Promise<UsageReason | null>;
  zoneUsage(zoneId: string): Promise<UsageReason | null>;
  /** Goalkeepers store the document type's code, not its id. */
  documentTypeUsage(code: string): Promise<UsageReason | null>;
  surfaceUsage(surfaceId: string): Promise<UsageReason | null>;
  /** The zones, of those given, that something points at. */
  zonesInUse(zoneIds: string[]): Promise<Set<string>>;
  documentTypesInUse(codes: string[]): Promise<Set<string>>;
  surfacesInUse(surfaceIds: string[]): Promise<Set<string>>;
  /** Top-ups, goalkeepers or requests in the country: its currency is then locked. */
  countryOperates(countryId: string): Promise<boolean>;
}

export interface IFutureBookingsProbe {
  /** An active request in the anchor city's zones that starts after `now`. */
  hasFutureRequestsInArea(anchorCityId: string, now: Date): Promise<boolean>;
}

/** Whether each operating city can quote, and how many required items it misses (US3). */
export interface ReadinessSummary {
  ready: boolean;
  missingCount: number;
}

export interface IReadinessSummary {
  /** Only for the given cities, which the caller knows are operating. */
  summarize(cities: City[]): Promise<Map<string, ReadinessSummary>>;
}

/** Which durations have a rate, for many city- and zone-scope refs in one read (readiness). */
export interface IRatePresence {
  pricedDurations(refs: { cityIds: string[]; zoneIds: string[] }): Promise<{ scope: 'city' | 'zone'; refId: string; durationMinutes: number }[]>;
}

/** The booking rules of many cities and countries in one read (readiness). */
export interface IBookingSettingsBatch {
  findMany(refs: { cityIds: string[]; countryIds: string[] }): Promise<BookingSettings[]>;
}

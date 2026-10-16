import type { ReadinessResult } from './readiness.js';
import type { Country } from '../../../../domain/countries/country.js';
import type { BookingSettings } from '../../../../domain/pricing/bookingSettings.js';
import type { DocumentType } from '../../../../domain/goalkeepers/documentType.js';
import type { City } from '../../../../domain/locations/city.js';
import type { Market } from '../../../../domain/markets/market.js';
import type { Region } from '../../../../domain/locations/region.js';
import type { MatchSurface } from '../../../../domain/pricing/matchSurface.js';
import type { Zone } from '../../../../domain/zones/zone.js';

/**
 * The admin's write side of the reference data (spec 003 of the admin). Separate from the
 * read-only ports the app uses (`IMarketRepository`, `IZoneRepository`…), which stay narrow.
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
  /** Only municipalities of these regions (a country is resolved to its regions by the caller). */
  regionIds?: string[];
  q?: string;
}

export interface IAdminCityRepository {
  list(query: CityListQuery): Promise<Found<City>>;
  getById(id: string): Promise<City | null>;
  getByIds(ids: string[]): Promise<City[]>;
  /** Cities per region id. */
  countByRegion(regionIds: string[]): Promise<Map<string, number>>;
  create(city: City): Promise<void>;
  update(city: City): Promise<UpdateResult>;
  delete(id: string): Promise<boolean>;
}

/** A zone without its polygon. */
export interface ZoneSummary {
  id: string;
  marketId: string;
  name: string;
  slug: string;
  active: boolean;
  displayOrder: number;
  revision: number;
}

export interface IAdminZoneRepository {
  /** Every zone of the market, active or not, by `displayOrder` then id. */
  listByMarket(marketId: string): Promise<Zone[]>;
  /** Every active zone of every market: the zones a new or reactivated one must not touch (FR-003). */
  listActive(): Promise<Zone[]>;
  /**
   * The zones of several markets without their polygons, in one read: the lists and the readiness.
   * Real polygons weigh up to ~300 KB each, so they are read only where they are drawn.
   */
  summariesByMarkets(marketIds: string[]): Promise<ZoneSummary[]>;
  getById(id: string): Promise<Zone | null>;
  findBySlug(slug: string): Promise<Zone | null>;
  /** Zones per market id (any state). */
  countByMarket(marketIds: string[]): Promise<Map<string, number>>;
  /** Every market id that has at least one zone (any state). */
  zoneOwnerIds(): Promise<string[]>;
  create(zone: Zone): Promise<void>;
  update(zone: Zone): Promise<UpdateResult>;
  /**
   * Sets each zone's `displayOrder` if it is still at `revision`, and bumps it. `'stale'` when any
   * of them moved on; the others may already be written (the admin reloads the list either way).
   */
  reorder(entries: { id: string; revision: number; displayOrder: number }[]): Promise<UpdateResult>;
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
  | 'city_in_use'
  | 'zone_in_use'
  | 'document_type_in_use'
  | 'surface_in_use';

/** Looks across the collections that point at reference data (research §8 and §9). */
export interface IReferenceUsage {
  regionUsage(regionId: string): Promise<UsageReason | null>;
  cityUsage(marketId: string): Promise<UsageReason | null>;
  zoneUsage(zoneId: string): Promise<UsageReason | null>;
  /** Goalkeepers store the document type's code, not its id. */
  documentTypeUsage(code: string): Promise<UsageReason | null>;
  surfaceUsage(surfaceId: string): Promise<UsageReason | null>;
  /** The zones, of those given, that something points at. */
  zonesInUse(zoneIds: string[]): Promise<Set<string>>;
  documentTypesInUse(codes: string[]): Promise<Set<string>>;
  surfacesInUse(surfaceIds: string[]): Promise<Set<string>>;
  /** Deposits, goalkeepers or requests in the country: its currency is then locked. */
  countryOperates(countryId: string): Promise<boolean>;
}

export interface IFutureBookingsProbe {
  /** An active request in the market's zones that starts after `now`. */
  hasFutureRequestsInArea(marketId: string, now: Date): Promise<boolean>;
}

/** Whether each market can quote, and how many required items it misses (US3; spec 031). */
export interface ReadinessSummary {
  ready: boolean;
  missingCount: number;
}

export interface IReadinessSummary {
  summarize(markets: Market[]): Promise<Map<string, ReadinessSummary>>;
  /** One market's whole checklist, items included (spec 031: enabling needs it complete). */
  check(market: Market): Promise<ReadinessResult>;
}

/** Which durations have a rate, for many market- and zone-scope refs in one read (readiness). */
export interface IRatePresence {
  pricedDurations(refs: { marketIds: string[]; zoneIds: string[] }): Promise<{ scope: 'market' | 'zone'; refId: string; durationMinutes: number }[]>;
}

/** The booking rules of many markets and countries in one read (readiness). */
export interface IBookingSettingsBatch {
  findMany(refs: { marketIds: string[]; countryIds: string[] }): Promise<BookingSettings[]>;
}

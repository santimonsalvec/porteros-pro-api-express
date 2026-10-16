import type {
  CityListQuery,
  Found,
  IAdminCityRepository,
  IAdminCountryRepository,
  IAdminDocumentTypeRepository,
  IAdminMatchSurfaceRepository,
  IAdminRegionRepository,
  IAdminZoneRepository,
  PageRequest,
  UpdateResult,
} from '../../src/application/features/geography/common/ports.js';
import { Country } from '../../src/domain/countries/country.js';
import { DocumentType } from '../../src/domain/goalkeepers/documentType.js';
import { City } from '../../src/domain/locations/city.js';
import { Region } from '../../src/domain/locations/region.js';
import { MatchSurface } from '../../src/domain/pricing/matchSurface.js';
import { Zone } from '../../src/domain/zones/zone.js';
import { FakeCityRepository } from './fakeCityRepository.js';
import { FakeCountryRepository } from './fakeCountryRepository.js';
import { FakeDocumentTypeRepository } from './fakeDocumentTypeRepository.js';
import { FakeMatchSurfaceRepository } from './fakeMatchSurfaceRepository.js';
import { FakeRegionRepository } from './fakeRegionRepository.js';
import { FakeZoneRepository } from './fakeZoneRepository.js';

/**
 * In-memory admin repositories (spec 003 of the admin), with the same optimistic `revision`
 * rule as Mongo. Each one works on the storage of the app's read-only fake it is given, so an
 * HTTP test sees an admin write in the app's routes.
 */

interface Revisioned {
  id: string;
  revision: number;
}

class MapStore<T extends Revisioned> {
  constructor(
    readonly items: Map<string, T>,
    private readonly withRevision: (item: T, revision: number) => T,
  ) {}

  page(sorted: T[], { page, pageSize }: PageRequest): Found<T> {
    const start = (page - 1) * pageSize;
    return { items: sorted.slice(start, start + pageSize), totalItems: sorted.length };
  }

  async getById(id: string): Promise<T | null> {
    return this.items.get(id) ?? null;
  }

  async getByIds(ids: string[]): Promise<T[]> {
    return ids.flatMap((id) => this.items.get(id) ?? []);
  }

  async create(item: T): Promise<void> {
    this.items.set(item.id, item);
  }

  async update(item: T): Promise<UpdateResult> {
    const stored = this.items.get(item.id);
    if (!stored || stored.revision !== item.revision) return 'stale';
    this.items.set(item.id, this.withRevision(item, item.revision + 1));
    return 'saved';
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  values(): T[] {
    return [...this.items.values()];
  }
}

const byName = <T extends { name: string; id: string }>(a: T, b: T) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
const startsWith = (value: string, q?: string) => !q || value.toLowerCase().startsWith(q.toLowerCase());
const counts = (keys: string[], values: (string | null)[]) =>
  new Map(keys.map((key) => [key, values.filter((value) => value === key).length]));

export class FakeAdminCountryRepository extends MapStore<Country> implements IAdminCountryRepository {
  constructor(readonly base = new FakeCountryRepository()) {
    super(base.countries, (c, revision) => new Country({ ...c, revision }));
  }

  async list(query: PageRequest & { q?: string }) {
    return this.page(this.values().filter((c) => startsWith(c.name, query.q)).sort(byName), query);
  }

  async findByCode(code: string) {
    return this.values().find((c) => c.countryCode.toUpperCase() === code.toUpperCase()) ?? null;
  }
}

export class FakeAdminRegionRepository extends MapStore<Region> implements IAdminRegionRepository {
  constructor(readonly base = new FakeRegionRepository()) {
    super(base.regions, (r, revision) => new Region({ ...r, revision }));
  }

  async list(query: PageRequest & { countryId?: string; q?: string }) {
    const items = this.values().filter((r) => (!query.countryId || r.countryId === query.countryId) && startsWith(r.name, query.q));
    return this.page(items.sort(byName), query);
  }

  async getByCountry(countryId: string) {
    return this.values().filter((r) => r.countryId === countryId);
  }

  async countByCountry(countryIds: string[]) {
    return counts(countryIds, this.values().map((r) => r.countryId));
  }
}

export class FakeAdminCityRepository extends MapStore<City> implements IAdminCityRepository {
  constructor(readonly base = new FakeCityRepository()) {
    super(base.cities, (c, revision) => new City({ ...c, revision }));
  }

  async list(query: CityListQuery) {
    const items = this.values().filter((c) => (!query.regionIds || query.regionIds.includes(c.regionId)) && startsWith(c.name, query.q));
    return this.page(items.sort(byName), query);
  }

  async countByRegion(regionIds: string[]) {
    return counts(regionIds, this.values().map((c) => c.regionId));
  }
}

export class FakeAdminZoneRepository extends MapStore<Zone> implements IAdminZoneRepository {
  constructor(readonly base = new FakeZoneRepository()) {
    super(base.zones, (z, revision) => new Zone({ ...z, revision }));
  }

  async listByMarket(marketId: string) {
    return this.values()
      .filter((z) => z.marketId === marketId)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));
  }

  async summariesByMarkets(marketIds: string[]) {
    return this.values()
      .filter((z) => marketIds.includes(z.marketId))
      .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id))
      .map(({ id, marketId, name, slug, active, displayOrder, revision }) => ({ id, marketId, name, slug, active, displayOrder, revision }));
  }

  async listActive() {
    return this.values().filter((z) => z.active);
  }

  async findBySlug(slug: string) {
    return this.values().find((z) => z.slug === slug) ?? null;
  }

  async countByMarket(marketIds: string[]) {
    return counts(marketIds, this.values().map((z) => z.marketId));
  }

  async zoneOwnerIds() {
    return [...new Set(this.values().map((z) => z.marketId))];
  }
}

export class FakeAdminDocumentTypeRepository extends MapStore<DocumentType> implements IAdminDocumentTypeRepository {
  constructor(readonly base = new FakeDocumentTypeRepository()) {
    super(base.documentTypes, (d, revision) => new DocumentType({ ...d, revision }));
  }

  async list(query: PageRequest & { q?: string }) {
    return this.page(this.values().filter((d) => startsWith(d.name, query.q) || startsWith(d.code, query.q)).sort(byName), query);
  }

  async findByCode(code: string) {
    return this.values().find((d) => d.code === code) ?? null;
  }

  async getAll() {
    return this.values();
  }
}

/** The surfaces fake keeps an array; this one indexes it by id on every call. */
export class FakeAdminMatchSurfaceRepository implements IAdminMatchSurfaceRepository {
  constructor(readonly base = new FakeMatchSurfaceRepository([])) {}

  private get store() {
    const items = new Map(this.base.surfaces.map((s) => [s.id, s]));
    return new MapStore(items, (s, revision) => new MatchSurface({ ...s, revision }));
  }

  private replace(items: Map<string, MatchSurface>) {
    this.base.surfaces.splice(0, this.base.surfaces.length, ...items.values());
  }

  async list(query: PageRequest & { active?: boolean }) {
    const store = this.store;
    const items = store
      .values()
      .filter((s) => query.active === undefined || s.active === query.active)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    return store.page(items, query);
  }

  async getById(id: string) {
    return this.store.getById(id);
  }

  async create(surface: MatchSurface) {
    const store = this.store;
    await store.create(surface);
    this.replace(store.items);
  }

  async update(surface: MatchSurface) {
    const store = this.store;
    const result = await store.update(surface);
    this.replace(store.items);
    return result;
  }

  async delete(id: string) {
    const store = this.store;
    const deleted = await store.delete(id);
    this.replace(store.items);
    return deleted;
  }
}

/** The six repositories together, as the handlers receive them. */
export function fakeAdminGeography() {
  return {
    countries: new FakeAdminCountryRepository(),
    regions: new FakeAdminRegionRepository(),
    cities: new FakeAdminCityRepository(),
    zones: new FakeAdminZoneRepository(),
    documentTypes: new FakeAdminDocumentTypeRepository(),
    surfaces: new FakeAdminMatchSurfaceRepository(),
  };
}

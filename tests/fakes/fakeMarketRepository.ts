import type {
  IAdminMarketRepository,
  MarketCreateResult,
  MarketDeleteResult,
  MarketUpdateResult,
} from '../../src/application/features/markets/common/ports.js';
import { Market, type MarketStatus } from '../../src/domain/markets/market.js';

const byName = (a: Market, b: Market) => a.name.localeCompare(b.name, 'es');

/** In-memory markets (spec 031), with the same name-per-country and revision rules as Mongo. */
export class FakeMarketRepository implements IAdminMarketRepository {
  readonly markets = new Map<string, Market>();
  /** Calls to `getByIds`, so a test can check that a context reads once. */
  getByIdsCalls = 0;

  seed(market: Market): Market {
    this.markets.set(market.id, market);
    return market;
  }

  async getById(id: string): Promise<Market | null> {
    return this.markets.get(id) ?? null;
  }

  async getByIds(ids: readonly string[]): Promise<Market[]> {
    this.getByIdsCalls += 1;
    return ids.flatMap((id) => this.markets.get(id) ?? []);
  }

  async list(): Promise<Market[]> {
    return [...this.markets.values()].sort(byName);
  }

  async listByCountry(countryId: string): Promise<Market[]> {
    return [...this.markets.values()].filter((market) => market.countryId === countryId).sort(byName);
  }

  async listEnabled(): Promise<Market[]> {
    return [...this.markets.values()].filter((market) => market.status === 'enabled').sort(byName);
  }

  async create(market: Market): Promise<MarketCreateResult> {
    if (this.nameTaken(market)) return 'name_taken';
    this.markets.set(market.id, market);
    return 'created';
  }

  async update(market: Market, expectedRevision: number): Promise<MarketUpdateResult> {
    const stored = this.markets.get(market.id);
    if (!stored || stored.revision !== expectedRevision) return 'stale';
    if (this.nameTaken(market)) return 'name_taken';
    this.markets.set(market.id, Market.fromStored({ ...market.toProps(), countryId: stored.countryId, revision: stored.revision + 1 }));
    return 'saved';
  }

  async delete(id: string, expectedRevision: number): Promise<MarketDeleteResult> {
    const stored = this.markets.get(id);
    if (!stored) return 'not_found';
    if (stored.revision !== expectedRevision) return 'stale';
    this.markets.delete(id);
    return 'deleted';
  }

  private nameTaken(market: Market): boolean {
    return [...this.markets.values()].some((other) => other.id !== market.id && other.countryId === market.countryId && other.nameKey === market.nameKey);
  }
}

/** A market for tests: enabled in Colombia unless told otherwise. */
export function testMarket(overrides: Partial<{ id: string; name: string; countryId: string; timeZone: string; status: MarketStatus; revision: number }> = {}): Market {
  const now = new Date('2026-10-01T00:00:00Z');
  const status = overrides.status ?? 'enabled';
  return Market.fromStored({
    id: overrides.id ?? 'med',
    name: overrides.name ?? 'Medellín',
    countryId: overrides.countryId ?? 'co',
    timeZone: overrides.timeZone ?? 'America/Bogota',
    mapCenter: { lat: 6.25, lng: -75.56, zoom: 12 },
    status,
    enabledAt: status === 'draft' ? null : now,
    enabledBy: status === 'draft' ? null : 'staff-1',
    disabledAt: status === 'disabled' ? now : null,
    disabledBy: status === 'disabled' ? 'staff-1' : null,
    createdAt: now,
    createdBy: 'staff-1',
    updatedAt: now,
    revision: overrides.revision ?? 0,
  });
}

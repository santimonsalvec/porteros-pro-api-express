import type { Market } from '../../../../domain/markets/market.js';

/** Read side of the markets (spec 031): the quote, offers, the app's list and the resolvers. */
export interface IMarketRepository {
  getById(id: string): Promise<Market | null>;
  getByIds(ids: readonly string[]): Promise<Market[]>;
  /** The markets clients and goalkeepers see (FR-021), by name. */
  listEnabled(): Promise<Market[]>;
}

export type MarketCreateResult = 'created' | 'name_taken';
export type MarketUpdateResult = 'saved' | 'stale' | 'name_taken';
export type MarketDeleteResult = 'deleted' | 'stale' | 'not_found';

/** Write side, for the admin web (contracts/markets-api.md §C). */
export interface IAdminMarketRepository extends IMarketRepository {
  list(): Promise<Market[]>;
  listByCountry(countryId: string): Promise<Market[]>;
  create(market: Market): Promise<MarketCreateResult>;
  /** Writes every field but the country, only if the document is still at `expectedRevision`. */
  update(market: Market, expectedRevision: number): Promise<MarketUpdateResult>;
  delete(id: string, expectedRevision: number): Promise<MarketDeleteResult>;
}

import type { Market } from '../../../../domain/markets/market.js';
import type { ZoneGeometry } from '../../../../domain/zones/zone.js';
import { findZoneConflicts, validateZoneGeometry, type GeometryError, type ZoneConflict } from '../../../../domain/zones/zoneGeometry.js';
import type { IAdminMarketRepository } from '../../markets/common/ports.js';
import type { IAdminZoneRepository } from './ports.js';

/** Where a zone may live: an existing market (spec 031, FR-002). */
export type ZoneMarketCheck = { outcome: 'ok'; market: Market } | { outcome: 'market_not_found' };

export async function checkZoneMarket(markets: Pick<IAdminMarketRepository, 'getById'>, marketId: string): Promise<ZoneMarketCheck> {
  const market = await markets.getById(marketId);
  return market ? { outcome: 'ok', market } : { outcome: 'market_not_found' };
}

export interface GeometryReview {
  errors: GeometryError[];
  /** The active zones, of any market, the polygon crosses or touches (FR-003). */
  conflicts: ZoneConflict[];
}

/**
 * The polygon's errors and, when it has none and it would be active, the active zones of every
 * market it crosses or touches (spec 031, FR-003, research §2). `selfId` is the zone being
 * edited, left out of the comparison. An inactive zone is never checked: it blocks nothing.
 */
export async function reviewZoneGeometry(
  deps: { zones: Pick<IAdminZoneRepository, 'listActive'>; markets: Pick<IAdminMarketRepository, 'getByIds'> },
  geometry: unknown,
  selfId: string | null,
  active: boolean,
): Promise<GeometryReview> {
  const errors = validateZoneGeometry(geometry);
  if (errors.length > 0 || !active) return { errors, conflicts: [] };
  const others = await deps.zones.listActive();
  const markets = await deps.markets.getByIds([...new Set(others.map((zone) => zone.marketId))]);
  const nameOf = new Map(markets.map((market) => [market.id, market.name]));
  const candidates = others.map((zone) => ({ id: zone.id, name: zone.name, marketId: zone.marketId, marketName: nameOf.get(zone.marketId) ?? '', geometry: zone.geometry }));
  return { errors: [], conflicts: findZoneConflicts(geometry as ZoneGeometry, selfId, candidates) };
}

/** A new zone goes last unless it says otherwise. */
export const NEW_ZONE_ORDER = 9999;

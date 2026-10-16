import type { Zone } from '../../../../domain/zones/zone.js';

/** Minimal, read-only — mirrors `IDocumentTypeRepository`'s reference-data shape (research.md §1). */
export interface IZoneRepository {
  /** Sorted by `displayOrder` ascending, filtered to `active: true`. */
  getActiveByMarketId(marketId: string): Promise<Zone[]>;
  getManyByIds(ids: string[]): Promise<Zone[]>;
  /** Market ids (a subset of the given list) that have at least one active zone. */
  hasActiveZonesForMarketIds(marketIds: string[]): Promise<Set<string>>;
  /** Every market id with at least one active zone. */
  getMarketIdsWithActiveZones(): Promise<string[]>;
  /**
   * The active zone whose polygon contains the point (boundary counts as inside). When
   * several match, the lowest `displayOrder` wins, then the lowest `id`, so the same
   * coordinates always resolve to the same zone.
   */
  findActiveContainingPoint(latitude: number, longitude: number): Promise<Zone | null>;
  /** An inactive zone that contains the point: asked when no active one does (spec 031, research §8). */
  findAnyContainingPoint(latitude: number, longitude: number): Promise<Zone | null>;
}

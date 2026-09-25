import type { Zone } from '../../../../domain/zones/zone.js';

/** Minimal, read-only — mirrors `IDocumentTypeRepository`'s reference-data shape (research.md §1). */
export interface IZoneRepository {
  /** Sorted by `displayOrder` ascending, filtered to `active: true`. */
  getActiveByCityId(anchorCityId: string): Promise<Zone[]>;
  getManyByIds(ids: string[]): Promise<Zone[]>;
  /** Anchor city ids (a subset of the given list) that have at least one active zone. */
  hasActiveZonesForCityIds(anchorCityIds: string[]): Promise<Set<string>>;
  /**
   * The active zone whose polygon contains the point (boundary counts as inside). When
   * several match, the lowest `displayOrder` wins, then the lowest `id`, so the same
   * coordinates always resolve to the same zone.
   */
  findActiveContainingPoint(latitude: number, longitude: number): Promise<Zone | null>;
}

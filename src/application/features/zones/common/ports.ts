import type { Zone } from '../../../../domain/zones/zone.js';

/** Minimal, read-only — mirrors `IDocumentTypeRepository`'s reference-data shape (research.md §1). */
export interface IZoneRepository {
  /** Sorted by `displayOrder` ascending, filtered to `active: true`. */
  getActiveByCityId(anchorCityId: string): Promise<Zone[]>;
  getManyByIds(ids: string[]): Promise<Zone[]>;
  /** Anchor city ids (a subset of the given list) that have at least one active zone. */
  hasActiveZonesForCityIds(anchorCityIds: string[]): Promise<Set<string>>;
}

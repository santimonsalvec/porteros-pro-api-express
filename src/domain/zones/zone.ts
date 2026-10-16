import { Entity } from '../common/entity.js';
import { readRevision } from '../common/revision.js';

/**
 * A zone's GeoJSON polygon. The admin validates it before saving (`zoneGeometry.ts`); seeded
 * documents are read as stored, so code that reads a zone must not assume it is valid.
 */
export interface ZoneGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: unknown[];
}

/** A service zone of a market (spec 031): drawn in the admin web, never moved to another market. */
export class Zone extends Entity<string> {
  /** The market it belongs to; it never changes (FR-002a). */
  readonly marketId: string;
  readonly name: string;
  readonly slug: string;
  readonly geometry: ZoneGeometry;
  readonly active: boolean;
  readonly displayOrder: number;
  /** Edit counter for the admin's optimistic concurrency; 0 when never edited there. */
  readonly revision: number;

  constructor(params: {
    id: string;
    marketId: string;
    name: string;
    slug: string;
    geometry: ZoneGeometry;
    active: boolean;
    displayOrder: number;
    revision?: number;
  }) {
    super(params.id);
    this.marketId = params.marketId;
    this.name = params.name;
    this.slug = params.slug;
    this.geometry = params.geometry;
    this.active = params.active;
    this.displayOrder = params.displayOrder;
    this.revision = readRevision(params.revision, `zones document ${params.id}`);
  }
}

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

/** A service zone of an anchor city: seeded by the data owner, edited in the admin web (spec 003). */
export class Zone extends Entity<string> {
  /** Always an anchor city's id — never a satellite city's id. */
  readonly cityId: string;
  readonly name: string;
  readonly slug: string;
  readonly geometry: ZoneGeometry;
  readonly active: boolean;
  readonly displayOrder: number;
  /** Edit counter for the admin's optimistic concurrency; 0 when never edited there. */
  readonly revision: number;

  constructor(params: {
    id: string;
    cityId: string;
    name: string;
    slug: string;
    geometry: ZoneGeometry;
    active: boolean;
    displayOrder: number;
    revision?: number;
  }) {
    super(params.id);
    this.cityId = params.cityId;
    this.name = params.name;
    this.slug = params.slug;
    this.geometry = params.geometry;
    this.active = params.active;
    this.displayOrder = params.displayOrder;
    this.revision = readRevision(params.revision, `zones document ${params.id}`);
  }
}

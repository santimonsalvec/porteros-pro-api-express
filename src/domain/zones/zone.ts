import { Entity } from '../common/entity.js';

/** Raw GeoJSON — this system never inspects or validates its contents, only stores/returns it opaquely. */
export interface ZoneGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: unknown[];
}

/** Pre-existing, externally-owned reference data — this system only reads it. */
export class Zone extends Entity<string> {
  /** Always an anchor city's id — never a satellite city's id. */
  readonly cityId: string;
  readonly name: string;
  readonly slug: string;
  readonly geometry: ZoneGeometry;
  readonly active: boolean;
  readonly displayOrder: number;

  constructor(params: {
    id: string;
    cityId: string;
    name: string;
    slug: string;
    geometry: ZoneGeometry;
    active: boolean;
    displayOrder: number;
  }) {
    super(params.id);
    this.cityId = params.cityId;
    this.name = params.name;
    this.slug = params.slug;
    this.geometry = params.geometry;
    this.active = params.active;
    this.displayOrder = params.displayOrder;
  }
}

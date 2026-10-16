import type { IZoneRepository } from '../../src/application/features/zones/common/ports.js';
import { Zone } from '../../src/domain/zones/zone.js';

/** Even-odd ray casting over one linear ring of GeoJSON `[lng, lat]` positions. */
function ringContains(ring: number[][], lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > lat !== yj! > lat && lng < ((xj! - xi!) * (lat - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

/** Exterior ring only (test polygons have no holes). Handles `Polygon` and `MultiPolygon`. */
function geometryContains(zone: Zone, lng: number, lat: number): boolean {
  const { type, coordinates } = zone.geometry;
  if (type === 'Polygon') {
    const ring = (coordinates as number[][][])[0];
    return ring !== undefined && ring.length > 2 && ringContains(ring, lng, lat);
  }
  return (coordinates as number[][][][]).some((polygon) => {
    const ring = polygon[0];
    return ring !== undefined && ring.length > 2 && ringContains(ring, lng, lat);
  });
}

export class FakeZoneRepository implements IZoneRepository {
  readonly zones = new Map<string, Zone>();

  seed(zone: Zone): void {
    this.zones.set(zone.id, zone);
  }

  async getActiveByMarketId(anchorCityId: string): Promise<Zone[]> {
    return [...this.zones.values()]
      .filter((zone) => zone.marketId === anchorCityId && zone.active)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async getManyByIds(ids: string[]): Promise<Zone[]> {
    return ids.map((id) => this.zones.get(id)).filter((zone): zone is Zone => zone !== undefined);
  }

  async hasActiveZonesForMarketIds(anchorCityIds: string[]): Promise<Set<string>> {
    const result = new Set<string>();
    for (const zone of this.zones.values()) {
      if (zone.active && anchorCityIds.includes(zone.marketId)) result.add(zone.marketId);
    }
    return result;
  }

  async getMarketIdsWithActiveZones(): Promise<string[]> {
    return [...new Set([...this.zones.values()].filter((zone) => zone.active).map((zone) => zone.marketId))];
  }

  async findActiveContainingPoint(latitude: number, longitude: number): Promise<Zone | null> {
    return this.firstContaining(latitude, longitude, true);
  }

  async findAnyContainingPoint(latitude: number, longitude: number): Promise<Zone | null> {
    return this.firstContaining(latitude, longitude, false);
  }

  private async firstContaining(latitude: number, longitude: number, active: boolean): Promise<Zone | null> {
    const matches = [...this.zones.values()]
      .filter((zone) => zone.active === active && geometryContains(zone, longitude, latitude))
      .sort((a, b) => a.displayOrder - b.displayOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return matches[0] ?? null;
  }
}

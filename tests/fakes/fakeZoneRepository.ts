import type { IZoneRepository } from '../../src/application/features/zones/common/ports.js';
import { Zone } from '../../src/domain/zones/zone.js';

export class FakeZoneRepository implements IZoneRepository {
  private readonly zones = new Map<string, Zone>();

  seed(zone: Zone): void {
    this.zones.set(zone.id, zone);
  }

  async getActiveByCityId(anchorCityId: string): Promise<Zone[]> {
    return [...this.zones.values()]
      .filter((zone) => zone.cityId === anchorCityId && zone.active)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async getManyByIds(ids: string[]): Promise<Zone[]> {
    return ids.map((id) => this.zones.get(id)).filter((zone): zone is Zone => zone !== undefined);
  }

  async hasActiveZonesForCityIds(anchorCityIds: string[]): Promise<Set<string>> {
    const result = new Set<string>();
    for (const zone of this.zones.values()) {
      if (zone.active && anchorCityIds.includes(zone.cityId)) result.add(zone.cityId);
    }
    return result;
  }
}

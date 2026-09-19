import type { IRegionRepository } from '../../src/application/features/locations/common/ports.js';
import { Region } from '../../src/domain/locations/region.js';

export class FakeRegionRepository implements IRegionRepository {
  private readonly regions = new Map<string, Region>();

  seed(region: Region): void {
    this.regions.set(region.id, region);
  }

  async getByIds(ids: string[]): Promise<Region[]> {
    return ids.map((id) => this.regions.get(id)).filter((region): region is Region => region !== undefined);
  }
}

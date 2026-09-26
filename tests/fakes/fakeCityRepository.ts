import type { ICityRepository } from '../../src/application/features/locations/common/ports.js';
import { City } from '../../src/domain/locations/city.js';

export class FakeCityRepository implements ICityRepository {
  private readonly cities = new Map<string, City>();

  seed(city: City): void {
    this.cities.set(city.id, city);
  }

  async getById(id: string): Promise<City | null> {
    return this.cities.get(id) ?? null;
  }

  async getByIds(ids: string[]): Promise<City[]> {
    return ids.flatMap((id) => this.cities.get(id) ?? []);
  }

  async searchByName(query: string, limit: number): Promise<City[]> {
    const q = query.toLowerCase();
    return [...this.cities.values()].filter((city) => city.name.toLowerCase().includes(q)).slice(0, limit);
  }
}

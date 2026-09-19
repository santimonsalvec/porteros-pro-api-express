import type { City } from '../../../../domain/locations/city.js';
import type { Region } from '../../../../domain/locations/region.js';

/**
 * Minimal, read-only — mirrors `IDocumentTypeRepository`'s reference-data shape
 * (research.md §1), not the older, heavier `ICountryRepository`/`IRepository` shape.
 */
export interface ICityRepository {
  getById(id: string): Promise<City | null>;
  searchByName(query: string, limit: number): Promise<City[]>;
}

export interface IRegionRepository {
  getByIds(ids: string[]): Promise<Region[]>;
}

import type { ICountryRepository } from '../../src/application/features/profile/common/ports.js';
import { Country } from '../../src/domain/countries/country.js';

export class FakeCountryRepository implements ICountryRepository {
  private readonly countries = new Map<string, Country>();

  seed(country: Country): void {
    this.countries.set(country.id, country);
  }

  async getAll(): Promise<Country[]> {
    return [...this.countries.values()];
  }

  async getById(id: string): Promise<Country | null> {
    return this.countries.get(id) ?? null;
  }

  async add(): Promise<void> {
    throw new Error('Country reference data is read-only.');
  }

  async update(): Promise<void> {
    throw new Error('Country reference data is read-only.');
  }

  async delete(): Promise<void> {
    throw new Error('Country reference data is read-only.');
  }

  async findByCountryCode(countryCode: string): Promise<Country | null> {
    for (const country of this.countries.values()) {
      if (country.countryCode === countryCode) return country;
    }
    return null;
  }
}

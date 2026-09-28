import { GoalkeeperProfile } from '../../src/domain/goalkeepers/goalkeeperProfile.js';
import { Country } from '../../src/domain/countries/country.js';
import { City } from '../../src/domain/locations/city.js';
import { Region } from '../../src/domain/locations/region.js';
import type { InvoicingSnapshot } from '../../src/domain/wallet/walletMovement.js';
import type { FakeCityRepository } from '../fakes/fakeCityRepository.js';
import type { FakeCountryRepository } from '../fakes/fakeCountryRepository.js';
import type { FakeRegionRepository } from '../fakes/fakeRegionRepository.js';

export const WALLET_NOW = '2026-09-27T18:00:00.000Z';
export const COLOMBIA_INVOICING: InvoicingSnapshot = { documentType: 'CC', documentNumber: '1020304050' };

/** An active goalkeeper of Cali (Colombia, COP) with the given enabled zones. */
export function buildGoalkeeperProfile(
  userId: string,
  overrides: Partial<{ cityId: string; zoneIds: string[] }> = {},
): GoalkeeperProfile {
  return new GoalkeeperProfile({
    id: `profile-${userId}`,
    userId,
    documentType: COLOMBIA_INVOICING.documentType,
    documentNumber: COLOMBIA_INVOICING.documentNumber,
    issueDate: new Date('2015-01-01T00:00:00.000Z'),
    birthDate: new Date('1995-01-01T00:00:00.000Z'),
    documentPhotoAId: 'photo-a',
    documentPhotoBId: 'photo-b',
    heightCm: 185,
    weightKg: 80,
    cityId: overrides.cityId ?? 'city-cali',
    zoneIds: overrides.zoneIds ?? ['zone-cali-norte'],
    activatedAt: new Date('2026-09-01T00:00:00.000Z'),
  });
}

/** Cali → Valle del Cauca → Colombia (COP), plus a city whose region has no country. */
export function seedWalletWorld(repos: {
  cityRepository: FakeCityRepository;
  regionRepository: FakeRegionRepository;
  countryRepository: FakeCountryRepository;
}): void {
  repos.countryRepository.seed(new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'COP' }));
  repos.regionRepository.seed(new Region({ id: 'region-valle', name: 'Valle del Cauca', countryId: 'country-co' }));
  repos.regionRepository.seed(new Region({ id: 'region-orphan', name: 'Sin país', countryId: null }));
  repos.cityRepository.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null, timeZone: 'America/Bogota' }));
  repos.cityRepository.seed(new City({ id: 'city-orphan', name: 'Huérfana', regionId: 'region-orphan', zoneCityId: null }));
}

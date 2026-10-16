import type { BillingData } from '../../src/domain/goalkeepers/billing.js';
import { testMarket, type FakeMarketRepository } from '../fakes/fakeMarketRepository.js';
import { GoalkeeperProfile } from '../../src/domain/goalkeepers/goalkeeperProfile.js';
import type { Vetting } from '../../src/domain/goalkeepers/vetting.js';
import { VERIFIED_VETTING } from './vettingFixtures.js';
import { Country } from '../../src/domain/countries/country.js';
import type { InvoicingSnapshot } from '../../src/domain/operatingBalance/balanceMovement.js';
import type { FakeCountryRepository } from '../fakes/fakeCountryRepository.js';

export const OPERATING_BALANCE_NOW = '2026-09-27T18:00:00.000Z';
export const COLOMBIA_INVOICING: InvoicingSnapshot = { documentType: 'CC', documentNumber: '1020304050' };

/** An active, verified goalkeeper of Cali (Colombia, COP) with the given enabled zones (verified so pre-030 tests keep their meaning). */
/** Where the test goalkeepers live, for their invoices (spec 031): Cali's municipality. */
export const GOALKEEPER_BILLING: BillingData = { cityId: 'mun-cali', address: 'Calle 5 # 10-20', addressComplement: 'Apto 301' };

export function buildGoalkeeperProfile(
  userId: string,
  overrides: Partial<{ marketId: string; zoneIds: string[]; availableForOffers: boolean; suspendedUntil: Date | null; vetting: Vetting; billing: BillingData }> = {},
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
    marketId: overrides.marketId ?? 'city-cali',
    zoneIds: overrides.zoneIds ?? ['zone-cali-norte'],
    billing: overrides.billing ?? GOALKEEPER_BILLING,
    activatedAt: new Date('2026-09-01T00:00:00.000Z'),
    suspendedUntil: overrides.suspendedUntil ?? null,
    availableForOffers: overrides.availableForOffers ?? true,
    vetting: overrides.vetting ?? VERIFIED_VETTING,
  });
}

/** The market Cali in Colombia (COP), plus a market whose country has no currency. */
export function seedOperatingBalanceWorld(repos: {
  marketRepository: FakeMarketRepository;
  countryRepository: FakeCountryRepository;
}): void {
  repos.countryRepository.seed(new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'COP' }));
  repos.countryRepository.seed(new Country({ id: 'country-xx', name: 'Sin moneda', dialCode: '+0', countryCode: 'XX', currency: null }));
  repos.marketRepository.seed(testMarket({ id: 'city-cali', name: 'Cali', countryId: 'country-co', timeZone: 'America/Bogota' }));
  repos.marketRepository.seed(testMarket({ id: 'city-orphan', name: 'Huérfana', countryId: 'country-xx' }));
}

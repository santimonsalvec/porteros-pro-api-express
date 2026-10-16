import { CommissionResolver } from '../../../../../../src/application/features/operatingBalance/common/commissionResolver.js';
import { FakeAdminCountryRepository, FakeAdminZoneRepository } from '../../../../../fakes/fakeAdminGeography.js';
import { FakeBookingSettingsRepository } from '../../../../../fakes/fakeBookingSettingsRepository.js';
import { FixedClock } from '../../../../../fakes/fakeClock.js';
import { FakeMarketRepository } from '../../../../../fakes/fakeMarketRepository.js';
import { FakeCommissionSettingRepository } from '../../../../../fakes/fakeCommissionSettingRepository.js';
import { FakeCountryRepository } from '../../../../../fakes/fakeCountryRepository.js';
import { FakeRentalRateRepository } from '../../../../../fakes/fakeRentalRateRepository.js';
import { FakeTaxSettingsRepository } from '../../../../../fakes/fakeTaxSettingsRepository.js';
import { FakeZoneRepository } from '../../../../../fakes/fakeZoneRepository.js';
import { QUOTE_NOW, seedQuoteWorld } from '../../../../../fixtures/quoteFixtures.js';

/** The quote's seeded world (Cali: Norte, Sur, Centro) with the admin's views of it (admin spec 004 simulator). */
export function previewWorld() {
  const world = {
    zoneRepository: new FakeZoneRepository(),
    marketRepository: new FakeMarketRepository(),
    countryRepository: new FakeCountryRepository(),
    rentalRateRepository: new FakeRentalRateRepository(),
    bookingSettingsRepository: new FakeBookingSettingsRepository(),
    commissionSettingRepository: new FakeCommissionSettingRepository(),
    matchSurfaceRepository: undefined,
  };
  seedQuoteWorld(world);
  const taxSettings = new FakeTaxSettingsRepository();
  taxSettings.seed('country-co', 1900);
  return {
    ...world,
    countryLookup: world.countryRepository,
    commissionResolver: new CommissionResolver(world.commissionSettingRepository, world.zoneRepository, world.marketRepository),
    countries: new FakeAdminCountryRepository(world.countryRepository),
    markets: world.marketRepository,
    zones: new FakeAdminZoneRepository(world.zoneRepository),
    taxSettings,
    clock: new FixedClock(QUOTE_NOW),
  };
}

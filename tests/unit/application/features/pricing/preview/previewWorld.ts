import { CommissionResolver } from '../../../../../../src/application/features/wallet/common/commissionResolver.js';
import { FakeAdminCityRepository, FakeAdminCountryRepository, FakeAdminRegionRepository, FakeAdminZoneRepository } from '../../../../../fakes/fakeAdminGeography.js';
import { FakeBookingSettingsRepository } from '../../../../../fakes/fakeBookingSettingsRepository.js';
import { FixedClock } from '../../../../../fakes/fakeClock.js';
import { FakeCityRepository } from '../../../../../fakes/fakeCityRepository.js';
import { FakeCommissionSettingRepository } from '../../../../../fakes/fakeCommissionSettingRepository.js';
import { FakeCountryRepository } from '../../../../../fakes/fakeCountryRepository.js';
import { FakeRegionRepository } from '../../../../../fakes/fakeRegionRepository.js';
import { FakeRentalRateRepository } from '../../../../../fakes/fakeRentalRateRepository.js';
import { FakeTaxSettingsRepository } from '../../../../../fakes/fakeTaxSettingsRepository.js';
import { FakeZoneRepository } from '../../../../../fakes/fakeZoneRepository.js';
import { QUOTE_NOW, seedQuoteWorld } from '../../../../../fixtures/quoteFixtures.js';

/** The quote's seeded world (Cali: Norte, Sur, Centro) with the admin's views of it (admin spec 004 simulator). */
export function previewWorld() {
  const world = {
    zoneRepository: new FakeZoneRepository(),
    cityRepository: new FakeCityRepository(),
    regionRepository: new FakeRegionRepository(),
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
    commissionResolver: new CommissionResolver(world.commissionSettingRepository, world.zoneRepository, world.cityRepository, world.regionRepository),
    countries: new FakeAdminCountryRepository(world.countryRepository),
    regions: new FakeAdminRegionRepository(world.regionRepository),
    cities: new FakeAdminCityRepository(world.cityRepository),
    zones: new FakeAdminZoneRepository(world.zoneRepository),
    taxSettings,
    clock: new FixedClock(QUOTE_NOW),
  };
}

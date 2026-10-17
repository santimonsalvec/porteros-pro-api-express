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
import { FakeGoalkeeperProfileRepository } from '../../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeUserRepository } from '../../../../../fakes/fakeUserRepository.js';
import { buildGoalkeeperProfile } from '../../../../../fixtures/operatingBalanceFixtures.js';
import { User } from '../../../../../../src/domain/users/user.js';

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
  // Feature 033: a goalkeeper of Cali the simulator can be run for.
  const goalkeeperProfiles = new FakeGoalkeeperProfileRepository();
  goalkeeperProfiles.seed(buildGoalkeeperProfile('gk-1', { marketId: 'city-cali', zoneIds: ['zone-cali-norte'] }));
  const users = new FakeUserRepository();
  const juan = User.createFromExternalIdentity({ id: 'gk-1', email: 'gk-1@example.com', displayName: null, provider: 'google', subject: 'gk-1' });
  juan.completeProfile('Juan', 'Pérez', '+57', '300 111 2222');
  users.seed(juan);
  return {
    goalkeeperProfiles,
    users,
    ...world,
    countryLookup: world.countryRepository,
    commissionResolver: new CommissionResolver(world.commissionSettingRepository, world.zoneRepository, world.marketRepository, world.rentalRateRepository),
    countries: new FakeAdminCountryRepository(world.countryRepository),
    markets: world.marketRepository,
    zones: new FakeAdminZoneRepository(world.zoneRepository),
    taxSettings,
    clock: new FixedClock(QUOTE_NOW),
  };
}

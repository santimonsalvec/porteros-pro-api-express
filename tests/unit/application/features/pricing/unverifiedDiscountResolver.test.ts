import { beforeEach, describe, expect, it } from 'vitest';
import { UnverifiedDiscountResolver } from '../../../../../src/application/features/pricing/common/unverifiedDiscountResolver.js';
import { FakeBookingSettingsRepository } from '../../../../fakes/fakeBookingSettingsRepository.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { FakeRentalRateRepository } from '../../../../fakes/fakeRentalRateRepository.js';
import { FakeUnverifiedDiscountRepository } from '../../../../fakes/fakeUnverifiedDiscountRepository.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { seedQuoteWorld } from '../../../../fixtures/quoteFixtures.js';

let discounts: FakeUnverifiedDiscountRepository;
let resolver: UnverifiedDiscountResolver;

beforeEach(() => {
  const world = {
    zoneRepository: new FakeZoneRepository(),
    cityRepository: new FakeCityRepository(),
    regionRepository: new FakeRegionRepository(),
    countryRepository: new FakeCountryRepository(),
    rentalRateRepository: new FakeRentalRateRepository(),
    bookingSettingsRepository: new FakeBookingSettingsRepository(),
  };
  seedQuoteWorld(world);
  discounts = new FakeUnverifiedDiscountRepository();
  resolver = new UnverifiedDiscountResolver(discounts, world.zoneRepository, world.cityRepository, world.regionRepository);
});

describe('UnverifiedDiscountResolver (admin spec 030, FR-018)', () => {
  it('is no discount and 15 minutes where nothing is configured', async () => {
    expect(await resolver.forZone('zone-cali-norte')).toEqual({ discountBps: 0, verifiedPriorityMinutes: 15 });
  });

  it('a zone inherits from its city, the city from its country, and the most specific wins', async () => {
    discounts.seed('country', 'country-co', 500, 'co', 30);
    discounts.seed('city', 'city-cali', 1000);
    discounts.seed('zone', 'zone-cali-norte', 1500, 'norte', 5);

    expect(await resolver.forZones(['zone-cali-norte', 'zone-cali-sur'])).toEqual(
      new Map([
        ['zone-cali-norte', { discountBps: 1500, verifiedPriorityMinutes: 5 }],
        ['zone-cali-sur', { discountBps: 1000, verifiedPriorityMinutes: 30 }],
      ]),
    );
  });

  it('an unknown zone has no discount', async () => {
    expect(await resolver.forZones(['nowhere'])).toEqual(new Map([['nowhere', { discountBps: 0, verifiedPriorityMinutes: 15 }]]));
  });
});

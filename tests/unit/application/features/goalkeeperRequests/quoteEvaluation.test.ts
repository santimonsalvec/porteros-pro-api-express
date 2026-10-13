import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateQuoteInArea, type QuoteEvaluationDependencies } from '../../../../../src/application/features/goalkeeperRequests/common/quoteEvaluation.js';
import { parseStartsAt } from '../../../../../src/application/features/goalkeeperRequests/common/startsAt.js';
import { CommissionResolver } from '../../../../../src/application/features/wallet/common/commissionResolver.js';
import type { City } from '../../../../../src/domain/locations/city.js';
import type { Zone } from '../../../../../src/domain/zones/zone.js';
import { FakeBookingSettingsRepository } from '../../../../fakes/fakeBookingSettingsRepository.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeCommissionSettingRepository } from '../../../../fakes/fakeCommissionSettingRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { FakeRentalRateRepository } from '../../../../fakes/fakeRentalRateRepository.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { QUOTE_NOW, seedQuoteWorld } from '../../../../fixtures/quoteFixtures.js';

let deps: QuoteEvaluationDependencies & { rentalRateRepository: FakeRentalRateRepository; commissionSettingRepository: FakeCommissionSettingRepository };
let zone: Zone;
let city: City;
const now = new Date(QUOTE_NOW).getTime();

beforeEach(async () => {
  const world = {
    zoneRepository: new FakeZoneRepository(),
    cityRepository: new FakeCityRepository(),
    regionRepository: new FakeRegionRepository(),
    countryRepository: new FakeCountryRepository(),
    rentalRateRepository: new FakeRentalRateRepository(),
    bookingSettingsRepository: new FakeBookingSettingsRepository(),
    commissionSettingRepository: new FakeCommissionSettingRepository(),
  };
  seedQuoteWorld(world);
  deps = {
    ...world,
    countryLookup: world.countryRepository,
    commissionResolver: new CommissionResolver(world.commissionSettingRepository, world.zoneRepository, world.cityRepository, world.regionRepository),
  };
  zone = (await world.zoneRepository.getManyByIds(['zone-cali-norte']))[0]!;
  city = (await world.cityRepository.getById('city-cali'))!;
});

const evaluate = (startsAt: string, nowMs = now, overrides: Partial<Parameters<typeof evaluateQuoteInArea>[1]> = {}) =>
  evaluateQuoteInArea(deps, {
    zone,
    city,
    timeZone: 'America/Bogota',
    startsAt: parseStartsAt(startsAt)!,
    goalkeeperCount: 1,
    durationMinutes: 60,
    match: { modality: 'futbol_11', level: 'competitive' },
    nowMs,
    ...overrides,
  });

describe('evaluateQuoteInArea (the quote steps 3–9, with the moment passed in)', () => {
  it('prices a valid start with the zone rate and the surcharge tier', async () => {
    expect(await evaluate('2026-09-21T14:00:00')).toMatchObject({
      outcome: 'priced',
      unitRate: 40000,
      unitSurcharge: 5000,
      total: 45000,
      currency: 'COP',
      commission: 7000,
      startsAtLocal: '2026-09-21T14:00:00-05:00',
    });
  });

  it.each([
    ['a start off the half-hour', '2026-09-21T15:15:00', { outcome: 'invalid_start_time', reason: 'not_on_slot' }],
    ['a start in the past', '2026-09-21T12:00:00', { outcome: 'start_time_in_past' }],
    ['a start inside the minimum notice', '2026-09-21T13:00:00', { outcome: 'insufficient_notice', minNoticeMinutes: 30 }],
    ['a start outside the booking window', '2026-09-25T15:00:00', { outcome: 'outside_booking_window', bookingWindowDays: 2 }],
  ])('refuses %s', async (_label, startsAt, expected) => {
    expect(await evaluate(startsAt)).toEqual(expected);
  });

  it('judges notice and surcharge from the moment it is given, not the clock', async () => {
    const anHourEarlier = now - 60 * 60_000;
    expect(await evaluate('2026-09-21T14:00:00', anHourEarlier)).toMatchObject({ outcome: 'priced', unitSurcharge: 0 });
    expect(await evaluate('2026-09-21T13:30:00', anHourEarlier)).toMatchObject({ outcome: 'priced', unitSurcharge: 5000 });
    expect(await evaluate('2026-09-21T13:00:00', anHourEarlier)).toMatchObject({ outcome: 'priced', unitSurcharge: 5000 });
  });

  it('reports what is missing, and a duration with no rate', async () => {
    deps.commissionSettingRepository.clear();
    expect(await evaluate('2026-09-21T15:00:00')).toEqual({ outcome: 'service_not_configured', cityId: 'city-cali', missing: ['commission'] });
  });

  it('refuses a duration nobody priced', async () => {
    deps.rentalRateRepository.clear();
    expect(await evaluate('2026-09-21T15:00:00')).toEqual({ outcome: 'rate_not_configured', zoneId: 'zone-cali-norte', cityId: 'city-cali', durationMinutes: 60 });
  });
});

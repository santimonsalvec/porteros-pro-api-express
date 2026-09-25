import { beforeEach, describe, expect, it } from 'vitest';
import { Country } from '../../../../../src/domain/countries/country.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { Region } from '../../../../../src/domain/locations/region.js';
import { BookingSettings } from '../../../../../src/domain/pricing/bookingSettings.js';
import { InvalidConfigurationError } from '../../../../../src/domain/pricing/invalidConfigurationError.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { GetBookingConfigQuery } from '../../../../../src/application/features/goalkeeperRequests/queries/getBookingConfig/getBookingConfigQuery.js';
import { GetBookingConfigQueryHandler } from '../../../../../src/application/features/goalkeeperRequests/queries/getBookingConfig/getBookingConfigQueryHandler.js';
import { GetServiceQuoteQuery } from '../../../../../src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQuery.js';
import { GetServiceQuoteQueryHandler } from '../../../../../src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQueryHandler.js';
import { parseStartsAt } from '../../../../../src/application/features/goalkeeperRequests/common/startsAt.js';
import { FakeBookingSettingsRepository } from '../../../../fakes/fakeBookingSettingsRepository.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { FakeRentalRateRepository } from '../../../../fakes/fakeRentalRateRepository.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { POINTS, QUOTE_NOW, seedQuoteWorld } from '../../../../fixtures/quoteFixtures.js';

/** Fake-backed handlers over the shared quote world. Reference clock: 13:00 in Bogotá (18:00Z). */
class Harness {
  readonly zoneRepository = new FakeZoneRepository();
  readonly cityRepository = new FakeCityRepository();
  readonly regionRepository = new FakeRegionRepository();
  readonly countryRepository = new FakeCountryRepository();
  readonly rentalRateRepository = new FakeRentalRateRepository();
  readonly bookingSettingsRepository = new FakeBookingSettingsRepository();
  readonly clock = new FixedClock(QUOTE_NOW);
  readonly config: GetBookingConfigQueryHandler;
  readonly quote: GetServiceQuoteQueryHandler;

  constructor() {
    seedQuoteWorld(this);
    this.config = new GetBookingConfigQueryHandler(
      this.zoneRepository,
      this.cityRepository,
      this.regionRepository,
      this.countryRepository,
      this.bookingSettingsRepository,
      this.clock,
    );
    this.quote = new GetServiceQuoteQueryHandler(
      this.zoneRepository,
      this.cityRepository,
      this.regionRepository,
      this.countryRepository,
      this.rentalRateRepository,
      this.bookingSettingsRepository,
      this.clock,
    );
  }

  ask(point: { latitude: number; longitude: number } = POINTS.caliNorte) {
    return this.config.handle(new GetBookingConfigQuery(point));
  }

  async configOf(point: { latitude: number; longitude: number } = POINTS.caliNorte) {
    const result = await this.ask(point);
    if (result.outcome !== 'success') throw new Error(`expected success, got ${result.outcome}`);
    return result.config;
  }

  quoteAt(startsAt: string, point: { latitude: number; longitude: number } = POINTS.caliNorte) {
    return this.quote.handle(
      new GetServiceQuoteQuery({ ...point, startsAt: parseStartsAt(startsAt)!, goalkeeperCount: 1, durationMinutes: 60 }),
    );
  }
}

function box(latMin: number, latMax: number, lngMin: number, lngMax: number) {
  return {
    type: 'Polygon' as const,
    coordinates: [[[lngMin, latMin], [lngMax, latMin], [lngMax, latMax], [lngMin, latMax], [lngMin, latMin]]],
  };
}

let h: Harness;
beforeEach(() => {
  h = new Harness();
});

describe('GetBookingConfigQueryHandler — what a client may pick', () => {
  it('returns the full configuration for a covered location', async () => {
    expect(await h.ask()).toEqual({
      outcome: 'success',
      config: {
        timeZone: 'America/Bogota',
        now: '2026-09-21T13:00:00-05:00',
        bookingWindowDays: 2,
        availableDates: ['2026-09-21', '2026-09-22'],
        minNoticeMinutes: 30,
        slotStepMinutes: 30,
        earliestStartsAt: '2026-09-21T13:30:00-05:00',
        goalkeeperCount: { min: 1, max: 2 },
        durationOptions: [60, 90, 120],
        currency: 'COP',
      },
    });
  });

  it.each([
    ['18:10:00Z', '2026-09-21T14:00:00-05:00'], // 13:10 + 30 = 13:40 → up to 14:00
    ['18:29:59Z', '2026-09-21T14:00:00-05:00'], // 13:29:59 + 30 = 13:59:59 → 14:00
    ['18:30:00Z', '2026-09-21T14:00:00-05:00'], // 13:30 + 30 = 14:00 exactly, already on a mark
    ['18:30:01Z', '2026-09-21T14:30:00-05:00'], // just past a mark → next one
  ])('rounds now + minimum notice up to the next slot mark (now %s)', async (utc, expected) => {
    h.clock.set(`2026-09-21T${utc}`);

    expect((await h.configOf()).earliestStartsAt).toBe(expected);
  });

  it('rolls the earliest start into the next local day and keeps today in the dates', async () => {
    h.clock.set('2026-09-22T04:30:00.000Z'); // 23:30 on Sep 21 in Bogotá, already Sep 22 in UTC

    const config = await h.configOf();

    expect(config.availableDates).toEqual(['2026-09-21', '2026-09-22']);
    expect(config.now).toBe('2026-09-21T23:30:00-05:00');
    expect(config.earliestStartsAt).toBe('2026-09-22T00:00:00-05:00');
  });

  it('builds the dates across a month boundary', async () => {
    h.clock.set('2026-09-30T18:00:00.000Z');

    expect((await h.configOf()).availableDates).toEqual(['2026-09-30', '2026-10-01']);
  });

  it('returns no earliest start when the next slot already falls outside the booking window', async () => {
    h.bookingSettingsRepository.seed(new BookingSettings({ id: 'cali-window-1', scope: 'city', refId: 'city-cali', bookingWindowDays: 1 }));
    h.clock.set('2026-09-22T04:50:00.000Z'); // 23:50 on the last (only) day

    const config = await h.configOf();

    expect(config.availableDates).toEqual(['2026-09-21']);
    expect(config.earliestStartsAt).toBeNull();
  });

  it('honors a city override of the window and the minimum notice', async () => {
    h.bookingSettingsRepository.seed(
      new BookingSettings({ id: 'cali-override', scope: 'city', refId: 'city-cali', bookingWindowDays: 4, minNoticeMinutes: 45 }),
    );

    const config = await h.configOf();

    expect(config.bookingWindowDays).toBe(4);
    expect(config.availableDates).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']);
    expect(config.minNoticeMinutes).toBe(45);
    expect(config.earliestStartsAt).toBe('2026-09-21T14:00:00-05:00'); // 13:45 → 14:00
  });

  it('answers each location in its own country, time zone and currency', async () => {
    const mexico = await h.configOf(POINTS.cdmx);
    const newYork = await h.configOf(POINTS.nyc);

    expect(mexico).toMatchObject({ timeZone: 'America/Mexico_City', currency: 'MXN', now: '2026-09-21T12:00:00-06:00' });
    expect(newYork).toMatchObject({ timeZone: 'America/New_York', currency: 'USD', now: '2026-09-21T14:00:00-04:00' });
  });

  it('works in a half-hour offset zone', async () => {
    const config = await h.configOf(POINTS.delhi); // 18:00Z = 23:30 IST

    expect(config.now).toBe('2026-09-21T23:30:00+05:30');
    expect(config.availableDates).toEqual(['2026-09-21', '2026-09-22']);
    expect(config.earliestStartsAt).toBe('2026-09-22T00:00:00+05:30');
  });

  it('rounds to the LOCAL slot marks in a 45-minute offset zone, not the UTC ones', async () => {
    h.cityRepository.seed(new City({ id: 'city-ktm', name: 'Kathmandu', regionId: 'region-delhi', zoneCityId: null, timeZone: 'Asia/Kathmandu' }));
    h.zoneRepository.seed(
      new Zone({ id: 'zone-ktm', cityId: 'city-ktm', name: 'Centro', slug: 'ktm-centro', geometry: box(27.6, 27.8, 85.2, 85.4), active: true, displayOrder: 1 }),
    );
    h.clock.set('2026-09-21T06:00:00.000Z'); // 11:45 in Kathmandu (UTC+5:45); +30 = 12:15 → next local mark 12:30

    const config = await h.configOf({ latitude: 27.7, longitude: 85.3 });

    expect(config.earliestStartsAt).toBe('2026-09-21T12:30:00+05:45');
  });
});

describe('GetBookingConfigQueryHandler — agrees with the quote', () => {
  it('the earliest start it reports is accepted by a quote, and one step earlier is refused', async () => {
    for (const nowUtc of ['2026-09-21T18:00:00.000Z', '2026-09-21T18:10:00.000Z', '2026-09-21T18:30:01.000Z']) {
      h.clock.set(nowUtc);
      const { earliestStartsAt } = await h.configOf();

      expect(await h.quoteAt(earliestStartsAt!)).toMatchObject({ outcome: 'success' });
      const oneStepEarlier = new Date(Date.parse(earliestStartsAt!) - 30 * 60_000).toISOString();
      expect(await h.quoteAt(oneStepEarlier)).toMatchObject({ outcome: 'insufficient_notice' });
    }
  });

  it('the last minute of the last available date is accepted and the next date is refused', async () => {
    const { availableDates } = await h.configOf();
    const lastDate = availableDates[availableDates.length - 1]!;
    const nextDate = new Date(Date.parse(`${lastDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

    expect(await h.quoteAt(`${lastDate}T23:30:00`)).toMatchObject({ outcome: 'success' });
    expect(await h.quoteAt(`${nextDate}T00:00:00`)).toMatchObject({ outcome: 'outside_booking_window' });
  });

  it('every duration it offers can be quoted', async () => {
    const { durationOptions } = await h.configOf();
    const start = (await h.configOf()).availableDates[1]! + 'T15:00:00';

    for (const durationMinutes of durationOptions) {
      const result = await h.quote.handle(
        new GetServiceQuoteQuery({ ...POINTS.caliNorte, startsAt: parseStartsAt(start)!, goalkeeperCount: 1, durationMinutes }),
      );
      expect(result).toMatchObject({ outcome: 'success' });
    }
  });

  it('refuses exactly where a quote would refuse', async () => {
    h.bookingSettingsRepository.clear();

    expect(await h.ask()).toMatchObject({ outcome: 'service_not_configured' });
    expect(await h.quoteAt('2026-09-22T15:00:00')).toMatchObject({ outcome: 'service_not_configured' });
  });
});

describe('GetBookingConfigQueryHandler — refusals', () => {
  it('refuses a location inside no zone', async () => {
    expect(await h.ask(POINTS.nowhere)).toEqual({ outcome: 'location_not_covered' });
  });

  it('refuses a city with no time zone', async () => {
    h.cityRepository.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null, timeZone: null }));

    expect(await h.ask()).toEqual({ outcome: 'time_zone_not_configured', cityId: 'city-cali' });
  });

  it('refuses an area with no configuration, naming every missing setting', async () => {
    h.bookingSettingsRepository.clear();

    expect(await h.ask()).toEqual({
      outcome: 'service_not_configured',
      cityId: 'city-cali',
      missing: ['bookingWindowDays', 'minNoticeMinutes', 'leadTimeSurcharge'],
    });
  });

  it('refuses a country with no currency, naming the currency last', async () => {
    h.countryRepository.seed(new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }));

    expect(await h.ask()).toEqual({ outcome: 'service_not_configured', cityId: 'city-cali', missing: ['currency'] });
  });

  it('refuses a city whose region has no country recorded', async () => {
    h.regionRepository.seed(new Region({ id: 'region-valle', name: 'Valle del Cauca' }));

    expect(await h.ask()).toMatchObject({ outcome: 'service_not_configured', missing: expect.arrayContaining(['currency']) });
  });

  it('treats a time zone that is not a real IANA identifier as broken configuration', async () => {
    h.cityRepository.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null, timeZone: 'Mars/Olympus' }));

    await expect(h.ask()).rejects.toThrow(InvalidConfigurationError);
  });

  it('treats a malformed currency as broken configuration', async () => {
    h.countryRepository.seed(new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'peso' }));

    await expect(h.ask()).rejects.toThrow(InvalidConfigurationError);
  });

  it('fails loudly when a zone points at a city that does not exist', async () => {
    h.zoneRepository.seed(
      new Zone({ id: 'zone-dangling', cityId: 'city-missing', name: 'D', slug: 'd', geometry: box(50, 51, 10, 11), active: true, displayOrder: 1 }),
    );

    await expect(h.ask({ latitude: 50.5, longitude: 10.5 })).rejects.toThrow(/city-missing/);
  });
});

describe('GetBookingConfigQueryHandler — read-only', () => {
  it('only reads: zones, city, region, country and settings — never rates, never a write', async () => {
    const calls: string[] = [];
    const watch = <T extends object>(name: string, target: T): T =>
      new Proxy(target, {
        get(object, property, receiver) {
          const value = Reflect.get(object, property, receiver);
          if (typeof value === 'function' && typeof property === 'string' && !['seed', 'clear'].includes(property)) {
            return (...args: unknown[]) => {
              calls.push(`${name}.${property}`);
              return (value as (...a: unknown[]) => unknown).apply(object, args);
            };
          }
          return value;
        },
      });
    const handler = new GetBookingConfigQueryHandler(
      watch('zones', h.zoneRepository),
      watch('cities', h.cityRepository),
      watch('regions', h.regionRepository),
      watch('countries', h.countryRepository),
      watch('settings', h.bookingSettingsRepository),
      h.clock,
    );

    await handler.handle(new GetBookingConfigQuery(POINTS.caliNorte));
    await handler.handle(new GetBookingConfigQuery(POINTS.nowhere));

    const allowed = new Set(['zones.findActiveContainingPoint', 'cities.getById', 'regions.getByIds', 'countries.getById', 'settings.findFor']);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(allowed.has(call)).toBe(true);
  });
});

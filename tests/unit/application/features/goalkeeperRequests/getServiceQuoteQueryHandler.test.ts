import { beforeEach, describe, expect, it } from 'vitest';
import { Country } from '../../../../../src/domain/countries/country.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { Region } from '../../../../../src/domain/locations/region.js';
import { BookingSettings, type LeadTimeSurcharge } from '../../../../../src/domain/pricing/bookingSettings.js';
import { InvalidConfigurationError } from '../../../../../src/domain/pricing/invalidConfigurationError.js';
import { RentalRate } from '../../../../../src/domain/pricing/rentalRate.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { GetServiceQuoteQuery, type ServiceQuoteInput } from '../../../../../src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQuery.js';
import { GetServiceQuoteQueryHandler } from '../../../../../src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQueryHandler.js';
import { parseStartsAt } from '../../../../../src/application/features/goalkeeperRequests/common/startsAt.js';
import { FakeBookingSettingsRepository } from '../../../../fakes/fakeBookingSettingsRepository.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { FakeRentalRateRepository } from '../../../../fakes/fakeRentalRateRepository.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { POINTS, QUOTE_NOW, seedQuoteWorld } from '../../../../fixtures/quoteFixtures.js';

/** Fake-backed handler. Reference clock: 13:00 in Bogotá (18:00Z). */
class Harness {
  readonly zoneRepository = new FakeZoneRepository();
  readonly countryRepository = new FakeCountryRepository();
  readonly cityRepository = new FakeCityRepository();
  readonly regionRepository = new FakeRegionRepository();
  readonly rentalRateRepository = new FakeRentalRateRepository();
  readonly bookingSettingsRepository = new FakeBookingSettingsRepository();
  readonly clock = new FixedClock(QUOTE_NOW);
  readonly handler: GetServiceQuoteQueryHandler;

  constructor() {
    seedQuoteWorld(this);
    this.handler = new GetServiceQuoteQueryHandler(
      this.zoneRepository,
      this.cityRepository,
      this.regionRepository,
      this.countryRepository,
      this.rentalRateRepository,
      this.bookingSettingsRepository,
      this.clock,
    );
  }

  quote(startsAt: string, overrides: Partial<Omit<ServiceQuoteInput, 'startsAt'>> = {}) {
    const parsed = parseStartsAt(startsAt);
    if (!parsed) throw new Error(`bad test startsAt: ${startsAt}`);
    return this.handler.handle(
      new GetServiceQuoteQuery({
        ...POINTS.caliNorte,
        goalkeeperCount: 1,
        durationMinutes: 60,
        ...overrides,
        startsAt: parsed,
      }),
    );
  }
}

let h: Harness;
beforeEach(() => {
  h = new Harness();
});

describe('GetServiceQuoteQueryHandler — Story 1: price a booking', () => {
  it('prices 1 goalkeeper for 60 minutes with no surcharge when the start is 120 minutes away', async () => {
    const result = await h.quote('2026-09-21T15:00:00'); // now 13:00 → lead 120

    expect(result).toEqual({
      outcome: 'success',
      quote: {
        unitRate: 40000,
        goalkeeperCount: 1,
        subtotal: 40000,
        unitSurcharge: 0,
        surcharge: 0,
        total: 40000,
        currency: 'COP',
        startsAt: '2026-09-21T20:00:00.000Z',
        startsAtLocal: '2026-09-21T15:00:00-05:00',
        timeZone: 'America/Bogota',
      },
      area: { zoneId: 'zone-cali-norte', cityId: 'city-cali' },
    });
  });

  it('doubles the subtotal for 2 goalkeepers', async () => {
    const result = await h.quote('2026-09-21T15:00:00', { goalkeeperCount: 2 });

    expect(result).toMatchObject({ outcome: 'success', quote: { unitRate: 40000, subtotal: 80000, surcharge: 0, total: 80000 } });
  });

  it('charges the lead-time surcharge once per goalkeeper: two goalkeepers pay it twice', async () => {
    h.clock.set('2026-09-21T19:15:00.000Z'); // 14:15 → 45 minutes of notice → the 10.000 tier

    const one = await h.quote('2026-09-21T15:00:00', { goalkeeperCount: 1 });
    const two = await h.quote('2026-09-21T15:00:00', { goalkeeperCount: 2 });

    expect(one).toMatchObject({ quote: { unitSurcharge: 10000, surcharge: 10000, subtotal: 40000, total: 50000 } });
    expect(two).toMatchObject({ quote: { unitSurcharge: 10000, surcharge: 20000, subtotal: 80000, total: 100000 } });
  });

  it('applies the middle tier per goalkeeper too', async () => {
    h.clock.set('2026-09-21T18:30:00.000Z'); // 13:30 → 90 minutes → the 5.000 tier

    const result = await h.quote('2026-09-21T15:00:00', { goalkeeperCount: 2, durationMinutes: 90 });

    expect(result).toMatchObject({ quote: { unitRate: 55000, unitSurcharge: 5000, surcharge: 10000, subtotal: 110000, total: 120000 } });
  });

  it('adds no surcharge for two goalkeepers when the tier is 0', async () => {
    const result = await h.quote('2026-09-21T15:00:00', { goalkeeperCount: 2 }); // 120 minutes → tier 0

    expect(result).toMatchObject({ quote: { unitSurcharge: 0, surcharge: 0, total: 80000 } });
  });

  it.each([
    ['18:00:00', 1], ['18:00:00', 2], // 120 min → tier 0
    ['18:30:00', 1], ['18:30:00', 2], // 90 min → middle tier
    ['19:15:00', 1], ['19:15:00', 2], // 45 min → highest tier
  ] as const)('keeps the invariants of a quote at %sZ with %s goalkeeper(s), for every duration', async (utc, count) => {
    h.clock.set(`2026-09-21T${utc}.000Z`);

    for (const durationMinutes of [60, 90, 120] as const) {
      const result = await h.quote('2026-09-21T15:00:00', { goalkeeperCount: count, durationMinutes });
      if (result.outcome !== 'success') throw new Error(`expected success, got ${result.outcome}`);
      const q = result.quote;

      expect(q.subtotal).toBe(q.unitRate * count);
      expect(q.surcharge).toBe(q.unitSurcharge * count);
      expect(q.total).toBe(q.subtotal + q.surcharge);
      expect(q.total).toBe((q.unitRate + q.unitSurcharge) * count);
    }
  });

  it.each([
    [60, 40000],
    [90, 55000],
    [120, 70000],
  ] as const)('uses the rate of its own duration (%s min → %s)', async (durationMinutes, unitRate) => {
    const result = await h.quote('2026-09-21T15:00:00', { durationMinutes });

    expect(result).toMatchObject({ outcome: 'success', quote: { unitRate, subtotal: unitRate, total: unitRate } });
  });

  it('adds the highest surcharge for a start 45 minutes away', async () => {
    h.clock.set('2026-09-21T19:15:00.000Z'); // 14:15 Bogotá → lead 45 to 15:00

    const result = await h.quote('2026-09-21T15:00:00');

    expect(result).toMatchObject({ outcome: 'success', quote: { subtotal: 40000, surcharge: 10000, total: 50000 } });
  });

  it('adds the middle surcharge for a start 90 minutes away', async () => {
    h.clock.set('2026-09-21T18:30:00.000Z'); // 13:30 → lead 90

    const result = await h.quote('2026-09-21T15:00:00');

    expect(result).toMatchObject({ outcome: 'success', quote: { surcharge: 5000, total: 45000 } });
  });

  it('adds no surcharge at exactly 120 minutes and the middle one just under it', async () => {
    h.clock.set('2026-09-21T18:00:00.000Z');
    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({ quote: { surcharge: 0 } });

    h.clock.set('2026-09-21T18:00:01.000Z'); // 119 min 59 s
    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({ quote: { surcharge: 5000 } });
  });

  it('applies the 60-minute boundary to the middle tier and 59:59 to the highest', async () => {
    h.clock.set('2026-09-21T19:00:00.000Z'); // lead exactly 60
    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({ quote: { surcharge: 5000 } });

    h.clock.set('2026-09-21T19:00:01.000Z'); // lead 59 min 59 s
    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({ quote: { surcharge: 10000 } });
  });

  it('reads the same offset-less local time in each city\'s own time zone', async () => {
    const bogota = await h.quote('2026-09-21T15:00:00');
    const mexico = await h.quote('2026-09-21T15:00:00', { ...POINTS.cdmx });

    expect(bogota).toMatchObject({ quote: { startsAt: '2026-09-21T20:00:00.000Z', timeZone: 'America/Bogota', currency: 'COP' } });
    expect(mexico).toMatchObject({
      quote: {
        startsAt: '2026-09-21T21:00:00.000Z',
        startsAtLocal: '2026-09-21T15:00:00-06:00',
        timeZone: 'America/Mexico_City',
        currency: 'MXN',
        unitRate: 800,
      },
    });
  });

  it('applies the surcharge tier to the real instant of each city', async () => {
    h.clock.set('2026-09-21T19:15:00.000Z'); // 14:15 Bogotá → 45 min to 15:00 local Bogotá, 105 min to 15:00 Mexico City

    const bogota = await h.quote('2026-09-21T15:00:00');
    const mexico = await h.quote('2026-09-21T15:00:00', { ...POINTS.cdmx });

    expect(bogota).toMatchObject({ quote: { surcharge: 10000 } });
    expect(mexico).toMatchObject({ quote: { surcharge: 100 } });
  });

  it('converts an explicit offset to the same instant and returns the city-local form', async () => {
    const result = await h.quote('2026-09-21T15:00:00-05:00', { ...POINTS.nyc }); // 20:00Z = 16:00 in New York (UTC−4)

    expect(result).toMatchObject({
      outcome: 'success',
      quote: { startsAt: '2026-09-21T20:00:00.000Z', startsAtLocal: '2026-09-21T16:00:00-04:00', timeZone: 'America/New_York', currency: 'USD' },
    });
  });

  it('treats Z as UTC', async () => {
    const result = await h.quote('2026-09-21T20:00:00Z');

    expect(result).toMatchObject({ quote: { startsAt: '2026-09-21T20:00:00.000Z', startsAtLocal: '2026-09-21T15:00:00-05:00' } });
  });

  it('refuses an offset-less time skipped by a daylight-saving change', async () => {
    h.clock.set('2026-03-08T04:00:00.000Z');

    const result = await h.quote('2026-03-08T02:30:00', { ...POINTS.nyc });

    expect(result).toEqual({ outcome: 'invalid_start_time', reason: 'nonexistent_local_time' });
  });

  it('refuses an offset-less time repeated by a daylight-saving change, but accepts it with an explicit offset', async () => {
    h.clock.set('2026-11-01T04:00:00.000Z');

    expect(await h.quote('2026-11-01T01:30:00', { ...POINTS.nyc })).toEqual({ outcome: 'invalid_start_time', reason: 'ambiguous_local_time' });
    expect(await h.quote('2026-11-01T01:30:00-04:00', { ...POINTS.nyc })).toMatchObject({
      outcome: 'success',
      quote: { startsAt: '2026-11-01T05:30:00.000Z', startsAtLocal: '2026-11-01T01:30:00-04:00' },
    });
  });
});

describe('GetServiceQuoteQueryHandler — Story 2: city-rate fallback', () => {
  it('uses the city rate when the zone has no rate for the duration', async () => {
    const result = await h.quote('2026-09-21T15:00:00', { ...POINTS.caliCentro, durationMinutes: 90 });

    expect(result).toMatchObject({ outcome: 'success', quote: { unitRate: 56000, subtotal: 56000, currency: 'COP' } });
  });

  it('reports the zone the point fell in, not the city the rate came from', async () => {
    const result = await h.quote('2026-09-21T15:00:00', { ...POINTS.caliCentro, durationMinutes: 90 });

    expect(result).toMatchObject({ outcome: 'success', area: { zoneId: 'zone-cali-centro', cityId: 'city-cali' } });
  });

  it('applies the city rate per goalkeeper', async () => {
    const result = await h.quote('2026-09-21T15:00:00', { ...POINTS.caliCentro, goalkeeperCount: 2 });

    expect(result).toMatchObject({ outcome: 'success', quote: { unitRate: 41000, subtotal: 82000, total: 82000 } });
  });

  it('prefers the zone rate over the city rate when both exist', async () => {
    const result = await h.quote('2026-09-21T15:00:00', { ...POINTS.caliNorte, durationMinutes: 60 });

    expect(result).toMatchObject({ quote: { unitRate: 40000 } }); // zone 40.000, city 41.000
  });

  it('decides the fallback per duration, not per zone', async () => {
    const sixty = await h.quote('2026-09-21T15:00:00', { ...POINTS.caliSur, durationMinutes: 60 });
    const oneTwenty = await h.quote('2026-09-21T15:00:00', { ...POINTS.caliSur, durationMinutes: 120 });

    expect(sixty).toMatchObject({ quote: { unitRate: 45000 } }); // the zone's own 60-minute rate
    expect(oneTwenty).toMatchObject({ quote: { unitRate: 71000 } }); // no zone 120 rate → the city's
  });

  it('refuses, with no price, when neither the zone nor its city has a rate for the duration', async () => {
    const bare = new Harness();
    bare.rentalRateRepository.clear();

    const result = await bare.quote('2026-09-21T15:00:00', { ...POINTS.caliNorte });

    expect(result).toEqual({ outcome: 'rate_not_configured', zoneId: 'zone-cali-norte', cityId: 'city-cali', durationMinutes: 60 });
    expect(result).not.toHaveProperty('quote');
  });
});

/** A closed rectangle in GeoJSON `[lng, lat]` order, for ad-hoc zones. */
function box(latMin: number, latMax: number, lngMin: number, lngMax: number) {
  return {
    type: 'Polygon' as const,
    coordinates: [[[lngMin, latMin], [lngMax, latMin], [lngMax, latMax], [lngMin, latMax], [lngMin, latMin]]],
  };
}

describe('GetServiceQuoteQueryHandler — Story 3: refusals', () => {
  it('refuses a location inside no zone', async () => {
    const result = await h.quote('2026-09-21T15:00:00', { ...POINTS.nowhere });

    expect(result).toEqual({ outcome: 'location_not_covered' });
  });

  it('treats a location inside only an inactive zone as not covered', async () => {
    h.zoneRepository.seed(
      new Zone({ id: 'zone-off', cityId: 'city-cali', name: 'Off', slug: 'cali-co-off', geometry: box(10, 11, -71, -70), active: false, displayOrder: 1 }),
    );

    const result = await h.quote('2026-09-21T15:00:00', { latitude: 10.5, longitude: -70.5 });

    expect(result).toEqual({ outcome: 'location_not_covered' });
  });

  it.each(['2026-09-21T15:15:00', '2026-09-21T15:45:00', '2026-09-21T15:00:30', '2026-09-21T15:00:00.500'])(
    'refuses %s because it is not on a local 30-minute mark',
    async (startsAt) => {
      expect(await h.quote(startsAt)).toEqual({ outcome: 'invalid_start_time', reason: 'not_on_slot' });
    },
  );

  it('accepts both :00 and :30 marks', async () => {
    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({ outcome: 'success' });
    expect(await h.quote('2026-09-21T15:30:00')).toMatchObject({ outcome: 'success' });
  });

  it('judges the 30-minute mark in the city\'s local time, not on the UTC minute (half-hour offset)', async () => {
    h.clock.set('2026-09-21T06:00:00.000Z'); // 11:30 in New Delhi (UTC+5:30)

    // 09:30Z is :30 in UTC but 15:00 local → on the mark; 09:45Z is 15:15 local → off it.
    expect(await h.quote('2026-09-21T09:30:00Z', { ...POINTS.delhi })).toMatchObject({ outcome: 'success', quote: { startsAtLocal: '2026-09-21T15:00:00+05:30' } });
    expect(await h.quote('2026-09-21T09:45:00Z', { ...POINTS.delhi })).toEqual({ outcome: 'invalid_start_time', reason: 'not_on_slot' });
    // 10:00Z is on the hour in UTC but 15:30 local → also on the mark.
    expect(await h.quote('2026-09-21T10:00:00Z', { ...POINTS.delhi })).toMatchObject({ outcome: 'success' });
  });

  it('refuses a start time earlier than now, including a slot that began earlier today', async () => {
    expect(await h.quote('2026-09-21T12:00:00')).toEqual({ outcome: 'start_time_in_past' }); // now 13:00
    expect(await h.quote('2026-09-21T08:00:00')).toEqual({ outcome: 'start_time_in_past' });
    expect(await h.quote('2026-09-20T15:00:00')).toEqual({ outcome: 'start_time_in_past' });
  });

  it('refuses a start of exactly now as insufficient notice, not as past', async () => {
    expect(await h.quote('2026-09-21T13:00:00')).toEqual({ outcome: 'insufficient_notice', minNoticeMinutes: 30 });
  });

  it('refuses 29 minutes 59 seconds of notice and accepts exactly 30 minutes', async () => {
    h.clock.set('2026-09-21T19:30:01.000Z'); // 29:59 before 15:00 Bogotá (20:00Z)
    expect(await h.quote('2026-09-21T15:00:00')).toEqual({ outcome: 'insufficient_notice', minNoticeMinutes: 30 });

    h.clock.set('2026-09-21T19:30:00.000Z'); // exactly 30:00
    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({ outcome: 'success', quote: { surcharge: 10000 } });
  });

  it('cannot start at 14:30 when asked at 14:10 (20 minutes), but can at 15:00', async () => {
    h.clock.set('2026-09-21T19:10:00.000Z'); // 14:10 in Bogotá

    expect(await h.quote('2026-09-21T14:30:00')).toEqual({ outcome: 'insufficient_notice', minNoticeMinutes: 30 });
    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({ outcome: 'success' });
  });

  it('allows the last minute of tomorrow and refuses the first minute after it (window of 2 days)', async () => {
    expect(await h.quote('2026-09-21T23:30:00')).toMatchObject({ outcome: 'success' });
    expect(await h.quote('2026-09-22T23:30:00')).toMatchObject({ outcome: 'success' });
    expect(await h.quote('2026-09-23T00:00:00')).toEqual({ outcome: 'outside_booking_window', bookingWindowDays: 2 });
    expect(await h.quote('2026-09-24T15:00:00')).toEqual({ outcome: 'outside_booking_window', bookingWindowDays: 2 });
  });

  it('counts the window in local calendar days even when the UTC date differs', async () => {
    h.clock.set('2026-09-22T03:00:00.000Z'); // 22:00 on Sep 21 in Bogotá, but already Sep 22 in UTC

    expect(await h.quote('2026-09-22T23:30:00')).toMatchObject({ outcome: 'success' }); // tomorrow, local
    expect(await h.quote('2026-09-23T00:00:00')).toEqual({ outcome: 'outside_booking_window', bookingWindowDays: 2 });
  });

  it('gives every refusal a price-free result', async () => {
    const results = await Promise.all([
      h.quote('2026-09-21T15:00:00', { ...POINTS.nowhere }),
      h.quote('2026-09-21T15:15:00'),
      h.quote('2026-09-21T12:00:00'),
      h.quote('2026-09-21T13:00:00'),
      h.quote('2026-09-23T00:00:00'),
    ]);

    for (const result of results) {
      expect(result.outcome).not.toBe('success');
      expect(result).not.toHaveProperty('quote');
    }
  });

  it('resolves overlapping zones deterministically: lowest displayOrder, then lowest id', async () => {
    // Both overlap Cali Norte (displayOrder 1, rates of its own). Neither has rates → the city fallback (41.000) reveals which won.
    h.zoneRepository.seed(
      new Zone({ id: 'zone-z-first', cityId: 'city-cali', name: 'Z', slug: 'cali-co-z', geometry: box(3.4, 3.5, -76.55, -76.45), active: true, displayOrder: 0 }),
    );
    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({ quote: { unitRate: 41000 } });
    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({ quote: { unitRate: 41000 } }); // same answer every time

    const tied = new Harness();
    tied.zoneRepository.seed(
      new Zone({ id: 'zone-a-tie', cityId: 'city-cali', name: 'A', slug: 'cali-co-a', geometry: box(3.4, 3.5, -76.55, -76.45), active: true, displayOrder: 1 }),
    );
    // Same displayOrder (1) as Cali Norte: 'zone-a-tie' sorts before 'zone-cali-norte'.
    expect(await tied.quote('2026-09-21T15:00:00')).toMatchObject({ quote: { unitRate: 41000 } });
  });
});

describe('GetServiceQuoteQueryHandler — evaluation order', () => {
  it('reports an off-mark time before it reports the time being in the past', async () => {
    expect(await h.quote('2026-09-21T12:15:00')).toEqual({ outcome: 'invalid_start_time', reason: 'not_on_slot' });
  });

  it('reports a past time even in an area with no configuration (past needs no settings)', async () => {
    h.bookingSettingsRepository.clear();

    expect(await h.quote('2026-09-21T12:00:00')).toEqual({ outcome: 'start_time_in_past' });
  });

  it('reports missing configuration before insufficient notice or the window', async () => {
    h.bookingSettingsRepository.clear();

    expect(await h.quote('2026-09-21T13:00:00')).toMatchObject({ outcome: 'service_not_configured' });
    expect(await h.quote('2026-09-30T15:00:00')).toMatchObject({ outcome: 'service_not_configured' });
  });

  it('reports insufficient notice before the window', async () => {
    h.clock.set('2026-09-21T19:45:00.000Z');

    expect(await h.quote('2026-09-21T15:00:00')).toEqual({ outcome: 'insufficient_notice', minNoticeMinutes: 30 });
  });
});

const COP = (under60: number, under120: number): LeadTimeSurcharge => ({
  tiers: [
    { fromMinutes: 0, toMinutes: 60, amount: under60 },
    { fromMinutes: 60, toMinutes: 120, amount: under120 },
    { fromMinutes: 120, toMinutes: null, amount: 0 },
  ],
});

/** Replaces every seeded settings document with the given country-level rows. */
function reseedCountrySettings(harness: Harness, rows: Array<{ refId: string; window?: number; notice?: number; surcharge?: LeadTimeSurcharge }>) {
  harness.bookingSettingsRepository.clear();
  rows.forEach((row, index) => {
    harness.bookingSettingsRepository.seed(
      new BookingSettings({
        id: `country-row-${index}`,
        scope: 'country',
        refId: row.refId,
        bookingWindowDays: row.window ?? null,
        minNoticeMinutes: row.notice ?? null,
        leadTimeSurcharge: row.surcharge ?? null,
      }),
    );
  });
}

describe('GetServiceQuoteQueryHandler — Story 4: per-country configuration with city overrides', () => {
  it('refuses an area with no configuration at either level, naming every missing setting, with no price', async () => {
    h.bookingSettingsRepository.clear();

    const result = await h.quote('2026-09-21T15:00:00');

    expect(result).toEqual({
      outcome: 'service_not_configured',
      cityId: 'city-cali',
      missing: ['bookingWindowDays', 'minNoticeMinutes', 'leadTimeSurcharge'],
    });
    expect(result).not.toHaveProperty('quote');
  });

  it('names only the settings that are missing', async () => {
    reseedCountrySettings(h, [{ refId: 'country-co', notice: 30, surcharge: COP(10000, 5000) }]);

    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({ outcome: 'service_not_configured', missing: ['bookingWindowDays'] });
  });

  it('honors a changed booking window', async () => {
    reseedCountrySettings(h, [{ refId: 'country-co', window: 4, notice: 30, surcharge: COP(10000, 5000) }]);

    expect(await h.quote('2026-09-24T15:00:00')).toMatchObject({ outcome: 'success' }); // today + 3
    expect(await h.quote('2026-09-25T00:00:00')).toEqual({ outcome: 'outside_booking_window', bookingWindowDays: 4 });
  });

  it('honors a changed minimum notice', async () => {
    reseedCountrySettings(h, [{ refId: 'country-co', window: 2, notice: 45, surcharge: COP(10000, 5000) }]);
    h.clock.set('2026-09-21T19:20:00.000Z'); // 40 minutes before 15:00 Bogotá

    expect(await h.quote('2026-09-21T15:00:00')).toEqual({ outcome: 'insufficient_notice', minNoticeMinutes: 45 });
  });

  it('honors a changed tier amount and changed tier boundaries', async () => {
    reseedCountrySettings(h, [{ refId: 'country-co', window: 2, notice: 30, surcharge: COP(12000, 5000) }]);
    h.clock.set('2026-09-21T19:30:00.000Z'); // 30 minutes of notice
    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({ quote: { surcharge: 12000 } });

    reseedCountrySettings(h, [
      {
        refId: 'country-co',
        window: 2,
        notice: 30,
        surcharge: {
          tiers: [
            { fromMinutes: 0, toMinutes: 60, amount: 10000 },
            { fromMinutes: 60, toMinutes: 180, amount: 5000 },
            { fromMinutes: 180, toMinutes: null, amount: 0 },
          ],
        },
      },
    ]);
    h.clock.set('2026-09-21T17:30:00.000Z'); // 150 minutes of notice
    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({ quote: { surcharge: 5000 } });
  });

  it('applies a city override only to that city; a sibling city keeps the country values', async () => {
    h.cityRepository.seed(new City({ id: 'city-buga', name: 'Buga', regionId: 'region-valle', zoneCityId: null, timeZone: 'America/Bogota' }));
    h.zoneRepository.seed(
      new Zone({ id: 'zone-buga', cityId: 'city-buga', name: 'Centro', slug: 'buga-co-centro', geometry: box(4.0, 4.1, -76.4, -76.3), active: true, displayOrder: 1 }),
    );
    h.rentalRateRepository.seed(new RentalRate({ id: 'rate-buga', scope: 'city', refId: 'city-buga', durationMinutes: 60, amount: 30000 }));
    h.bookingSettingsRepository.seed(new BookingSettings({ id: 'cali-override', scope: 'city', refId: 'city-cali', bookingWindowDays: 4 }));
    const buga = { latitude: 4.05, longitude: -76.35 };

    expect(await h.quote('2026-09-24T15:00:00', { ...POINTS.caliNorte })).toMatchObject({ outcome: 'success' }); // Cali: 4 days
    expect(await h.quote('2026-09-24T15:00:00', buga)).toEqual({ outcome: 'outside_booking_window', bookingWindowDays: 2 }); // Buga: country's 2
  });

  it('resolves each setting on its own: a city that overrides only the tiers inherits window and notice', async () => {
    h.bookingSettingsRepository.seed(
      new BookingSettings({ id: 'cali-tiers', scope: 'city', refId: 'city-cali', leadTimeSurcharge: { tiers: [{ fromMinutes: 0, toMinutes: null, amount: 7000 }] } }),
    );

    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({ quote: { surcharge: 7000 } }); // own tiers
    expect(await h.quote('2026-09-23T00:00:00')).toEqual({ outcome: 'outside_booking_window', bookingWindowDays: 2 }); // country's window
    h.clock.set('2026-09-21T19:45:00.000Z');
    expect(await h.quote('2026-09-21T15:00:00')).toEqual({ outcome: 'insufficient_notice', minNoticeMinutes: 30 }); // country's notice
  });

  it('cannot quote a city whose region has no country recorded, even with complete city-level settings, because the currency is the country\'s', async () => {
    h.regionRepository.seed(new Region({ id: 'region-orphan', name: 'Orphan' })); // no countryId
    h.cityRepository.seed(new City({ id: 'city-orphan', name: 'Orphan', regionId: 'region-orphan', zoneCityId: null, timeZone: 'America/Bogota' }));
    h.zoneRepository.seed(
      new Zone({ id: 'zone-orphan', cityId: 'city-orphan', name: 'Z', slug: 'orphan-z', geometry: box(6, 6.1, -70.1, -70), active: true, displayOrder: 1 }),
    );
    h.rentalRateRepository.seed(new RentalRate({ id: 'rate-orphan', scope: 'city', refId: 'city-orphan', durationMinutes: 60, amount: 20000 }));
    const orphan = { latitude: 6.05, longitude: -70.05 };

    expect(await h.quote('2026-09-21T15:00:00', orphan)).toMatchObject({
      outcome: 'service_not_configured',
      missing: ['bookingWindowDays', 'minNoticeMinutes', 'leadTimeSurcharge', 'currency'],
    });

    h.bookingSettingsRepository.seed(new BookingSettings({ id: 'orphan-city', scope: 'city', refId: 'city-orphan', bookingWindowDays: 2, minNoticeMinutes: 30, leadTimeSurcharge: COP(1, 1) }));
    expect(await h.quote('2026-09-21T15:00:00', orphan)).toEqual({ outcome: 'service_not_configured', cityId: 'city-orphan', missing: ['currency'] });
  });

  it('never lets two countries share values or currencies', async () => {
    reseedCountrySettings(h, [
      { refId: 'country-co', window: 2, notice: 30, surcharge: COP(10000, 5000) },
      { refId: 'country-mx', window: 4, notice: 30, surcharge: { tiers: [{ fromMinutes: 0, toMinutes: null, amount: 150 }] } },
    ]);

    // Three days ahead: Mexico's window (4) allows it, Colombia's (2) does not.
    expect(await h.quote('2026-09-24T15:00:00', { ...POINTS.cdmx })).toMatchObject({ outcome: 'success', quote: { currency: 'MXN', surcharge: 150 } });
    expect(await h.quote('2026-09-24T15:00:00', { ...POINTS.caliNorte })).toEqual({ outcome: 'outside_booking_window', bookingWindowDays: 2 });
  });

  it('takes the currency of the quote from the country, for both the rate and the surcharge', async () => {
    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({ quote: { currency: 'COP' } });
    expect(await h.quote('2026-09-21T15:00:00', { ...POINTS.cdmx })).toMatchObject({ quote: { currency: 'MXN' } });

    h.countryRepository.seed(new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'USD' }));
    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({ quote: { currency: 'USD', unitRate: 40000 } });
  });

  it('refuses, naming the currency, when the country has no currency set', async () => {
    h.countryRepository.seed(new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }));

    const result = await h.quote('2026-09-21T15:00:00');

    expect(result).toEqual({ outcome: 'service_not_configured', cityId: 'city-cali', missing: ['currency'] });
    expect(result).not.toHaveProperty('quote');
  });

  it('refuses, naming the currency, when the country document does not exist at all', async () => {
    const empty = new Harness();
    empty.countryRepository.clear();

    expect(await empty.quote('2026-09-21T15:00:00')).toEqual({ outcome: 'service_not_configured', cityId: 'city-cali', missing: ['currency'] });
  });

  it('lists a missing currency after the other missing settings', async () => {
    h.bookingSettingsRepository.clear();
    h.countryRepository.seed(new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }));

    expect(await h.quote('2026-09-21T15:00:00')).toMatchObject({
      missing: ['bookingWindowDays', 'minNoticeMinutes', 'leadTimeSurcharge', 'currency'],
    });
  });

  it.each(['cop', 'COPP', 'Peso', '', 'CO'])('treats %j as broken configuration, not as a currency', async (currency) => {
    h.countryRepository.seed(new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency }));

    await expect(h.quote('2026-09-21T15:00:00')).rejects.toThrow(InvalidConfigurationError);
  });

  it('refuses a city with no time zone, without guessing another', async () => {
    h.cityRepository.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null, timeZone: null }));

    expect(await h.quote('2026-09-21T15:00:00')).toEqual({ outcome: 'time_zone_not_configured', cityId: 'city-cali' });
  });

  it('treats a time zone that is not a real IANA identifier as broken configuration', async () => {
    h.cityRepository.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null, timeZone: 'Mars/Olympus' }));

    await expect(h.quote('2026-09-21T15:00:00')).rejects.toThrow(InvalidConfigurationError);
  });

  it('fails loudly, not with a wrong answer, when a zone points at a city that does not exist', async () => {
    h.zoneRepository.seed(
      new Zone({ id: 'zone-dangling', cityId: 'city-missing', name: 'D', slug: 'd', geometry: box(50, 51, 10, 11), active: true, displayOrder: 1 }),
    );

    await expect(h.quote('2026-09-21T15:00:00', { latitude: 50.5, longitude: 10.5 })).rejects.toThrow(/city-missing/);
  });
});


describe('GetServiceQuoteQueryHandler — read-only guarantee (FR-020, SC-007)', () => {
  it('reads through ports that expose no write operation at all', () => {
    const repositories = [h.rentalRateRepository, h.bookingSettingsRepository];
    for (const repository of repositories) {
      for (const method of ['add', 'update', 'delete', 'save', 'insert', 'create', 'remove']) {
        expect((repository as unknown as Record<string, unknown>)[method]).toBeUndefined();
      }
    }
  });

  it('leaves every repository untouched across successful and refused quotes', async () => {
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

    const handler = new GetServiceQuoteQueryHandler(
      watch('zones', h.zoneRepository),
      watch('cities', h.cityRepository),
      watch('regions', h.regionRepository),
      watch('countries', h.countryRepository),
      watch('rates', h.rentalRateRepository),
      watch('settings', h.bookingSettingsRepository),
      h.clock,
    );
    const ask = (startsAt: string, point = POINTS.caliNorte) =>
      handler.handle(new GetServiceQuoteQuery({ ...point, startsAt: parseStartsAt(startsAt)!, goalkeeperCount: 2, durationMinutes: 90 }));

    await ask('2026-09-21T15:00:00');
    await ask('2026-09-21T12:00:00');
    await ask('2026-09-21T15:00:00', POINTS.nowhere);

    const allowed = new Set([
      'zones.findActiveContainingPoint',
      'cities.getById',
      'regions.getByIds',
      'countries.getById',
      'rates.findForDuration',
      'settings.findFor',
    ]);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(allowed.has(call)).toBe(true);
  });
});

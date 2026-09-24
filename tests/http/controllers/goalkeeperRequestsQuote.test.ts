import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';
import { POINTS } from '../../fixtures/quoteFixtures.js';
import { BookingSettings } from '../../../src/domain/pricing/bookingSettings.js';
import { Country } from '../../../src/domain/countries/country.js';
import { InvalidConfigurationError } from '../../../src/domain/pricing/invalidConfigurationError.js';
import { City } from '../../../src/domain/locations/city.js';
import { Zone } from '../../../src/domain/zones/zone.js';
import { logger } from '../../../src/infrastructure/observability/logger.js';

type TestApp = ReturnType<typeof buildTestApp>;

/** Signs in and completes the client profile, so the token passes `requireCompleteProfile`. */
async function signInAndComplete(context: TestApp, sub: string): Promise<string> {
  context.googleValidator.registerValidCredential(`cred-${sub}`, new ExternalIdentity('google', sub, `${sub}@example.com`));
  const exchange = await request(context.app)
    .post('/api/auth/sso/exchange')
    .send({ provider: 'google', platform: 'mobile', credential: `cred-${sub}` });
  const completion = await request(context.app)
    .post('/api/profile/complete')
    .set('Authorization', `Bearer ${exchange.body.accessToken}`)
    .send({ firstName: 'Ana', lastName: 'Cliente', countryCode: 'CO', whatsAppNumber: `300 000 ${sub.slice(-4).padStart(4, '0')}`, acceptedTerms: true });
  return completion.body.accessToken as string;
}

const validBody = {
  ...POINTS.caliNorte,
  startsAt: '2026-09-21T15:00:00', // clock is 13:00 in Bogotá → 120 minutes of notice
  goalkeeperCount: 1,
  durationMinutes: 60,
};

function post(context: TestApp, token: string, body: unknown) {
  return request(context.app).post('/api/goalkeeper-requests/quote').set('Authorization', `Bearer ${token}`).send(body as object);
}

describe('POST /api/goalkeeper-requests/quote — Story 1: price a booking', () => {
  it('returns the full price breakdown', async () => {
    const context = buildTestApp();
    const token = await signInAndComplete(context, 'sub-0001');

    const response = await post(context, token, validBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      unitRate: 40000,
      goalkeeperCount: 1,
      subtotal: 40000,
      surcharge: 0,
      total: 40000,
      currency: 'COP',
      startsAt: '2026-09-21T20:00:00.000Z',
      startsAtLocal: '2026-09-21T15:00:00-05:00',
      timeZone: 'America/Bogota',
    });
  });

  it('prices two goalkeepers with a lead-time surcharge (the contract worked example)', async () => {
    const context = buildTestApp();
    const token = await signInAndComplete(context, 'sub-0002');
    context.clock.set('2026-09-21T18:30:00.000Z'); // 13:30 → 90 minutes of notice

    const response = await post(context, token, { ...validBody, goalkeeperCount: 2, durationMinutes: 90 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ unitRate: 55000, subtotal: 110000, surcharge: 5000, total: 115000, currency: 'COP' });
  });

  it('reads an offset-less start time in the city of the location and reports that city\'s time zone', async () => {
    const context = buildTestApp();
    const token = await signInAndComplete(context, 'sub-0003');

    const response = await post(context, token, { ...validBody, ...POINTS.cdmx });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      currency: 'MXN',
      startsAt: '2026-09-21T21:00:00.000Z',
      startsAtLocal: '2026-09-21T15:00:00-06:00',
      timeZone: 'America/Mexico_City',
    });
  });

  it('accepts an explicit offset and returns the same instant in the city\'s local time', async () => {
    const context = buildTestApp();
    const token = await signInAndComplete(context, 'sub-0004');

    const response = await post(context, token, { ...validBody, ...POINTS.nyc, startsAt: '2026-09-21T15:00:00-05:00' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ startsAt: '2026-09-21T20:00:00.000Z', startsAtLocal: '2026-09-21T16:00:00-04:00' });
  });

  it('rejects a request with no token', async () => {
    const { app } = buildTestApp();

    const response = await request(app).post('/api/goalkeeper-requests/quote').send(validBody);

    expect(response.status).toBe(401);
  });

  it('rejects a client whose profile is not yet complete', async () => {
    const context = buildTestApp();
    context.googleValidator.registerValidCredential('cred-incomplete', new ExternalIdentity('google', 'sub-0005', 'sub-0005@example.com'));
    const exchange = await request(context.app)
      .post('/api/auth/sso/exchange')
      .send({ provider: 'google', platform: 'mobile', credential: 'cred-incomplete' });

    const response = await post(context, exchange.body.accessToken as string, validBody);

    expect(response.status).toBe(403);
  });
});

describe('POST /api/goalkeeper-requests/quote — Story 2: city-rate fallback', () => {
  it('falls back to the city rate when the zone has none', async () => {
    const context = buildTestApp();
    const token = await signInAndComplete(context, 'sub-0101');

    const response = await post(context, token, { ...validBody, ...POINTS.caliCentro, durationMinutes: 90 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ unitRate: 56000, total: 56000 });
  });

  it('returns 422 rate_not_configured, with no price, when no level has a rate', async () => {
    const context = buildTestApp();
    const token = await signInAndComplete(context, 'sub-0102');
    context.rentalRateRepository.clear();

    const response = await post(context, token, validBody);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('rate_not_configured');
    expect(response.body).not.toHaveProperty('total');
    expect(response.body).not.toHaveProperty('unitRate');
  });
});

describe('POST /api/goalkeeper-requests/quote — Story 3: refusals', () => {
  async function refused(sub: string, body: unknown) {
    const context = buildTestApp();
    const token = await signInAndComplete(context, sub);
    return post(context, token, body);
  }

  function expectNoPrice(body: Record<string, unknown>) {
    for (const key of ['unitRate', 'subtotal', 'surcharge', 'total', 'currency']) expect(body).not.toHaveProperty(key);
  }

  describe('400 validation_failed names every offending field', () => {
    it.each([
      ['a missing field', { ...validBody, startsAt: undefined }, ['startsAt']],
      ['a latitude above 90', { ...validBody, latitude: 95 }, ['latitude']],
      ['a longitude below −180', { ...validBody, longitude: -181 }, ['longitude']],
      ['3 goalkeepers', { ...validBody, goalkeeperCount: 3 }, ['goalkeeperCount']],
      ['0 goalkeepers', { ...validBody, goalkeeperCount: 0 }, ['goalkeeperCount']],
      ['a 45-minute duration', { ...validBody, durationMinutes: 45 }, ['durationMinutes']],
      ['a string where a number is required', { ...validBody, latitude: '3.45' }, ['latitude']],
      ['an unparseable start time', { ...validBody, startsAt: 'tomorrow at three' }, ['startsAt']],
      ['an impossible date', { ...validBody, startsAt: '2026-02-30T15:00:00' }, ['startsAt']],
      ['several problems at once', { ...validBody, latitude: 99, durationMinutes: 45, startsAt: 'x' }, ['latitude', 'durationMinutes', 'startsAt']],
    ])('%s', async (_label, body, fields) => {
      const response = await refused('sub-0201', body);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('validation_failed');
      expect(Object.keys(response.body.fieldErrors).sort()).toEqual([...fields].sort());
      expectNoPrice(response.body);
    });

    it('lists all five inputs when the body is empty', async () => {
      const response = await refused('sub-0202', {});

      expect(response.status).toBe(400);
      expect(Object.keys(response.body.fieldErrors).sort()).toEqual(
        ['durationMinutes', 'goalkeeperCount', 'latitude', 'longitude', 'startsAt'],
      );
    });
  });

  it('400 location_not_covered', async () => {
    const response = await refused('sub-0203', { ...validBody, ...POINTS.nowhere });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('location_not_covered');
    expectNoPrice(response.body);
  });

  it('400 invalid_start_time with the reason', async () => {
    const response = await refused('sub-0204', { ...validBody, startsAt: '2026-09-21T15:15:00' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid_start_time', reason: 'not_on_slot' });
    expectNoPrice(response.body);
  });

  it('400 start_time_in_past', async () => {
    const response = await refused('sub-0205', { ...validBody, startsAt: '2026-09-21T12:00:00' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('start_time_in_past');
    expectNoPrice(response.body);
  });

  it('400 insufficient_notice says there is not enough time for a goalkeeper to arrive', async () => {
    const response = await refused('sub-0206', { ...validBody, startsAt: '2026-09-21T13:00:00' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'insufficient_notice', minNoticeMinutes: 30 });
    expect(response.body.message).toMatch(/not enough time for a goalkeeper/i);
    expectNoPrice(response.body);
  });

  it('400 outside_booking_window', async () => {
    const response = await refused('sub-0207', { ...validBody, startsAt: '2026-09-23T00:00:00' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'outside_booking_window', bookingWindowDays: 2 });
    expectNoPrice(response.body);
  });

  it('accepts the last allowed minute of the window', async () => {
    const response = await refused('sub-0208', { ...validBody, startsAt: '2026-09-22T23:30:00' });

    expect(response.status).toBe(200);
  });
});

describe('POST /api/goalkeeper-requests/quote — Story 4: configuration', () => {
  async function withToken(sub: string) {
    const context = buildTestApp();
    const token = await signInAndComplete(context, sub);
    return { context, token };
  }

  it('422 service_not_configured lists the missing settings and returns no price', async () => {
    const { context, token } = await withToken('sub-0301');
    context.bookingSettingsRepository.clear();

    const response = await post(context, token, validBody);

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: 'service_not_configured', missing: ['bookingWindowDays', 'minNoticeMinutes', 'leadTimeSurcharge'] });
    expect(response.body).not.toHaveProperty('total');
  });

  it('422 service_not_configured, naming the currency, when the country has no currency', async () => {
    const { context, token } = await withToken('sub-0302');
    context.quoteCountryRepository.seed(new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }));

    const response = await post(context, token, validBody);

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: 'service_not_configured', missing: ['currency'] });
    expect(response.body).not.toHaveProperty('total');
  });

  it('500 internal_error when a country currency is malformed', async () => {
    const { context, token } = await withToken('sub-0310');
    context.quoteCountryRepository.seed(new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'peso' }));

    const response = await post(context, token, validBody);

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('internal_error');
    expect(JSON.stringify(response.body)).not.toContain('peso');
  });

  it('422 time_zone_not_configured for a city with no time zone', async () => {
    const { context, token } = await withToken('sub-0303');
    context.cityRepository.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null, timeZone: null }));

    const response = await post(context, token, validBody);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('time_zone_not_configured');
  });

  it('answers each country with its own currency and time zone', async () => {
    const { context, token } = await withToken('sub-0304');

    const colombia = await post(context, token, validBody);
    const mexico = await post(context, token, { ...validBody, ...POINTS.cdmx });

    expect(colombia.body).toMatchObject({ currency: 'COP', timeZone: 'America/Bogota' });
    expect(mexico.body).toMatchObject({ currency: 'MXN', timeZone: 'America/Mexico_City' });
  });

  it('applies a city override on top of the country configuration', async () => {
    const { context, token } = await withToken('sub-0305');
    context.bookingSettingsRepository.seed(new BookingSettings({ id: 'cali-window', scope: 'city', refId: 'city-cali', bookingWindowDays: 4 }));

    const response = await post(context, token, { ...validBody, startsAt: '2026-09-24T15:00:00' });

    expect(response.status).toBe(200);
  });

  it('500 internal_error, leaking nothing, when a stored configuration document is malformed', async () => {
    const { context, token } = await withToken('sub-0306');
    context.bookingSettingsRepository.findFor = async () => {
      throw new InvalidConfigurationError('bookingSettings document secret-doc-id: bookingWindowDays must be an integer of at least 1');
    };

    const response = await post(context, token, validBody);

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('internal_error');
    expect(JSON.stringify(response.body)).not.toContain('secret-doc-id');
    expect(response.body).not.toHaveProperty('total');
  });

  it('500 internal_error when a zone points at a city that does not exist', async () => {
    const { context, token } = await withToken('sub-0307');
    context.zoneRepository.seed(
      new Zone({
        id: 'zone-dangling',
        cityId: 'city-missing',
        name: 'D',
        slug: 'd',
        geometry: { type: 'Polygon', coordinates: [[[10, 50], [11, 50], [11, 51], [10, 51], [10, 50]]] },
        active: true,
        displayOrder: 1,
      }),
    );

    const response = await post(context, token, { ...validBody, latitude: 50.5, longitude: 10.5 });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('internal_error');
  });

  it('logs a warning for operators when an area is not configured, without changing the response', async () => {
    const { context, token } = await withToken('sub-0308');
    context.bookingSettingsRepository.clear();
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      const response = await post(context, token, validBody);

      expect(response.status).toBe(422);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'service_not_configured', cityId: 'city-cali', missing: expect.any(Array) }),
        expect.any(String),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('does not log a configuration warning for an ordinary refusal', async () => {
    const { context, token } = await withToken('sub-0309');
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      await post(context, token, { ...validBody, startsAt: '2026-09-21T12:00:00' });

      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});


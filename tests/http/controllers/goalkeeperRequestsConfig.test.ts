import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';
import { Country } from '../../../src/domain/countries/country.js';
import { City } from '../../../src/domain/locations/city.js';
import { BookingSettings } from '../../../src/domain/pricing/bookingSettings.js';
import { InvalidConfigurationError } from '../../../src/domain/pricing/invalidConfigurationError.js';
import { logger } from '../../../src/infrastructure/observability/logger.js';
import { POINTS } from '../../fixtures/quoteFixtures.js';

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

async function withToken(sub: string) {
  const context = buildTestApp();
  return { context, token: await signInAndComplete(context, sub) };
}

function get(context: TestApp, token: string, query: string) {
  return request(context.app).get(`/api/goalkeeper-requests/config${query}`).set('Authorization', `Bearer ${token}`);
}

const at = (point: { latitude: number; longitude: number }) => `?latitude=${point.latitude}&longitude=${point.longitude}`;

describe('GET /api/goalkeeper-requests/config', () => {
  it('returns what a client may pick for the pitch', async () => {
    const { context, token } = await withToken('sub-0401');

    const response = await get(context, token, at(POINTS.caliNorte));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
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
    });
  });

  it('answers each location with its own country, time zone and currency', async () => {
    const { context, token } = await withToken('sub-0402');

    const mexico = await get(context, token, at(POINTS.cdmx));

    expect(mexico.status).toBe(200);
    expect(mexico.body).toMatchObject({ timeZone: 'America/Mexico_City', currency: 'MXN', now: '2026-09-21T12:00:00-06:00' });
  });

  it('reflects a per-city override of the window', async () => {
    const { context, token } = await withToken('sub-0403');
    context.bookingSettingsRepository.seed(new BookingSettings({ id: 'cali-window', scope: 'city', refId: 'city-cali', bookingWindowDays: 3 }));

    const response = await get(context, token, at(POINTS.caliNorte));

    expect(response.body.bookingWindowDays).toBe(3);
    expect(response.body.availableDates).toEqual(['2026-09-21', '2026-09-22', '2026-09-23']);
  });

  it('agrees with the quote: the earliest start it reports quotes successfully', async () => {
    const { context, token } = await withToken('sub-0404');

    const config = await get(context, token, at(POINTS.caliNorte));
    const quote = await request(context.app)
      .post('/api/goalkeeper-requests/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...POINTS.caliNorte, startsAt: config.body.earliestStartsAt, goalkeeperCount: 1, durationMinutes: config.body.durationOptions[0] });

    expect(quote.status).toBe(200);
    expect(quote.body.currency).toBe(config.body.currency);
    expect(quote.body.timeZone).toBe(config.body.timeZone);
  });

  it('rejects a request with no token', async () => {
    const { app } = buildTestApp();

    expect((await request(app).get(`/api/goalkeeper-requests/config${at(POINTS.caliNorte)}`)).status).toBe(401);
  });

  it('rejects a client whose profile is not yet complete', async () => {
    const context = buildTestApp();
    context.googleValidator.registerValidCredential('cred-inc', new ExternalIdentity('google', 'sub-0405', 'sub-0405@example.com'));
    const exchange = await request(context.app).post('/api/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential: 'cred-inc' });

    expect((await get(context, exchange.body.accessToken as string, at(POINTS.caliNorte))).status).toBe(403);
  });
});

describe('GET /api/goalkeeper-requests/config — refusals', () => {
  it.each([
    ['no parameters', '', ['latitude', 'longitude']],
    ['a missing longitude', '?latitude=3.45', ['longitude']],
    ['an empty latitude', '?latitude=&longitude=-76.5', ['latitude']],
    ['a non-numeric latitude', '?latitude=abc&longitude=-76.5', ['latitude']],
    ['a latitude above 90', '?latitude=95&longitude=-76.5', ['latitude']],
    ['a longitude below -180', '?latitude=3.45&longitude=-181', ['longitude']],
    ['both out of range', '?latitude=91&longitude=181', ['latitude', 'longitude']],
    ['a repeated parameter', '?latitude=1&latitude=2&longitude=-76.5', ['latitude']],
  ])('400 validation_failed for %s, naming the offending fields', async (_label, query, fields) => {
    const { context, token } = await withToken('sub-0501');

    const response = await get(context, token, query);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_failed');
    expect(Object.keys(response.body.fieldErrors).sort()).toEqual([...fields].sort());
    expect(response.body).not.toHaveProperty('bookingWindowDays');
  });

  it('400 location_not_covered', async () => {
    const { context, token } = await withToken('sub-0502');

    const response = await get(context, token, at(POINTS.nowhere));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('location_not_covered');
  });

  it('422 service_not_configured, listing what is missing', async () => {
    const { context, token } = await withToken('sub-0503');
    context.bookingSettingsRepository.clear();

    const response = await get(context, token, at(POINTS.caliNorte));

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: 'service_not_configured', missing: ['bookingWindowDays', 'minNoticeMinutes', 'leadTimeSurcharge'] });
  });

  it('422 service_not_configured naming the currency when the country has none', async () => {
    const { context, token } = await withToken('sub-0504');
    context.quoteCountryRepository.seed(new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }));

    const response = await get(context, token, at(POINTS.caliNorte));

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: 'service_not_configured', missing: ['currency'] });
  });

  it('422 time_zone_not_configured', async () => {
    const { context, token } = await withToken('sub-0505');
    context.cityRepository.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null, timeZone: null }));

    const response = await get(context, token, at(POINTS.caliNorte));

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('time_zone_not_configured');
  });

  it('500 internal_error, leaking nothing, when a stored configuration document is malformed', async () => {
    const { context, token } = await withToken('sub-0506');
    context.bookingSettingsRepository.findFor = async () => {
      throw new InvalidConfigurationError('bookingSettings document secret-doc-id is malformed');
    };

    const response = await get(context, token, at(POINTS.caliNorte));

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('internal_error');
    expect(JSON.stringify(response.body)).not.toContain('secret-doc-id');
  });

  it('logs a warning for operators when an area is not configured, without changing the response', async () => {
    const { context, token } = await withToken('sub-0507');
    context.bookingSettingsRepository.clear();
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      const response = await get(context, token, at(POINTS.caliNorte));

      expect(response.status).toBe(422);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'service_not_configured', cityId: 'city-cali', missing: expect.any(Array) }),
        expect.stringContaining('Booking config'),
      );
    } finally {
      warn.mockRestore();
    }
  });
});

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';
import { POINTS } from '../../fixtures/quoteFixtures.js';

type TestApp = ReturnType<typeof buildTestApp>;

/** Signs in and completes the client profile, so the token passes `requireCompleteProfile`. */
async function signInAndComplete(context: TestApp, sub: string): Promise<string> {
  context.googleValidator.registerValidCredential(
    `cred-${sub}`,
    new ExternalIdentity('google', sub, `${sub}@example.com`),
  );
  const exchange = await request(context.app)
    .post('/api/auth/sso/exchange')
    .send({ provider: 'google', platform: 'mobile', credential: `cred-${sub}` });
  const completion = await request(context.app)
    .post('/api/profile/complete')
    .set('Authorization', `Bearer ${exchange.body.accessToken}`)
    .send({
      firstName: 'Ana',
      lastName: 'Cliente',
      countryCode: 'CO',
      whatsAppNumber: `300 000 ${sub.slice(-4).padStart(4, '0')}`,
      acceptedTerms: true,
    });
  return completion.body.accessToken as string;
}

// Clock: 18:30Z = 13:30 in Bogotá → 90 minutes of notice → the 5.000 tier: (55.000 + 5.000) × 2 = 120.000 COP.
const NOW = '2026-09-21T18:30:00.000Z';
const quoteBody = {
  ...POINTS.caliNorte,
  startsAt: '2026-09-21T15:00:00',
  goalkeeperCount: 2,
  durationMinutes: 90,
};

async function issueQuote(context: TestApp, token: string, body: object = quoteBody) {
  const response = await request(context.app)
    .post('/api/goalkeeper-requests/quote')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  expect(response.status).toBe(200);
  return response.body as { quoteId: string; expiresAt: string; total: number };
}

function confirm(context: TestApp, token: string, body: unknown) {
  return request(context.app)
    .post('/api/goalkeeper-requests/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send(body as object);
}

async function setUp(sub = 'sub-0001') {
  const context = buildTestApp();
  context.clock.set(NOW);
  const token = await signInAndComplete(context, sub);
  return { context, token };
}

describe('POST /api/goalkeeper-requests/bookings — Story 1: book at exactly the quoted price', () => {
  it('201 with a booking that copies the quote, and the quote is gone', async () => {
    const { context, token } = await setUp();
    const quote = await issueQuote(context, token);

    const response = await confirm(context, token, { quoteId: quote.quoteId });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      bookingId: expect.any(String),
      quoteId: quote.quoteId,
      status: 'pending_assignment',
      latitude: POINTS.caliNorte.latitude,
      longitude: POINTS.caliNorte.longitude,
      zoneId: 'zone-cali-norte',
      cityId: 'city-cali',
      startsAt: '2026-09-21T20:00:00.000Z',
      startsAtLocal: '2026-09-21T15:00:00-05:00',
      timeZone: 'America/Bogota',
      goalkeeperCount: 2,
      durationMinutes: 90,
      unitRate: 55000,
      subtotal: 110000,
      unitSurcharge: 5000,
      surcharge: 10000,
      total: 120000,
      currency: 'COP',
      createdAt: NOW,
    });
    expect(context.quoteRepository.all()).toHaveLength(0);
    expect(context.bookingRepository.all()).toHaveLength(1);
  });

  it('ignores price and match fields sent with the confirmation', async () => {
    const { context, token } = await setUp();
    const quote = await issueQuote(context, token);

    const response = await confirm(context, token, {
      quoteId: quote.quoteId,
      total: 1,
      goalkeeperCount: 1,
      startsAt: '2030-01-01T00:00:00Z',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      total: 120000,
      goalkeeperCount: 2,
      startsAt: '2026-09-21T20:00:00.000Z',
    });
  });

  it('keeps the quoted price when the rates change before confirming', async () => {
    const { context, token } = await setUp();
    const quote = await issueQuote(context, token);
    context.rentalRateRepository.clear(); // a re-price would now be refused as rate_not_configured

    const response = await confirm(context, token, { quoteId: quote.quoteId });

    expect(response.status).toBe(201);
    expect(response.body.total).toBe(120000);
  });

  it('401 without a token', async () => {
    const context = buildTestApp();

    const response = await request(context.app)
      .post('/api/goalkeeper-requests/bookings')
      .send({ quoteId: 'x' });

    expect(response.status).toBe(401);
  });

  it('403 when the client profile is not complete', async () => {
    const context = buildTestApp();
    context.googleValidator.registerValidCredential(
      'cred-new',
      new ExternalIdentity('google', 'sub-new', 'new@example.com'),
    );
    const exchange = await request(context.app)
      .post('/api/auth/sso/exchange')
      .send({ provider: 'google', platform: 'mobile', credential: 'cred-new' });

    const response = await confirm(context, exchange.body.accessToken as string, { quoteId: 'x' });

    expect(response.status).toBe(403);
  });
});

describe('POST /api/goalkeeper-requests/bookings — Story 2: retries are safe', () => {
  it('201 then 200 with the identical booking', async () => {
    const { context, token } = await setUp();
    const quote = await issueQuote(context, token);

    const first = await confirm(context, token, { quoteId: quote.quoteId });
    const retry = await confirm(context, token, { quoteId: quote.quoteId });

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
  });

  it('a double tap books once and both answers name the same booking', async () => {
    const { context, token } = await setUp();
    const quote = await issueQuote(context, token);

    const [a, b] = await Promise.all([
      confirm(context, token, { quoteId: quote.quoteId }),
      confirm(context, token, { quoteId: quote.quoteId }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.bookingId).toBe(b.body.bookingId);
    expect(context.bookingRepository.all()).toHaveLength(1);
  });

  it('409 confirmation_in_progress with Retry-After while a concurrent confirmation has not committed', async () => {
    const { context, token } = await setUp();
    const quote = await issueQuote(context, token);
    context.quoteConfirmationStore.failNextWith({ kind: 'not_claimed' });

    const response = await confirm(context, token, { quoteId: quote.quoteId });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('confirmation_in_progress');
    expect(response.headers['retry-after']).toBe('1');
    expect(context.bookingRepository.all()).toHaveLength(0);
  });
});

describe('POST /api/goalkeeper-requests/bookings — Story 4: refusals are clear and change nothing', () => {
  it.each([
    ['a missing quoteId', {}],
    ['a numeric quoteId', { quoteId: 123 }],
  ])('400 validation_failed for %s', async (_label, body) => {
    const { context, token } = await setUp();

    const response = await confirm(context, token, body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'validation_failed',
      fieldErrors: { quoteId: expect.any(String) },
    });
  });

  it.each([
    ['an unknown quote id', '01924f6e-0000-7000-8000-000000000000'],
    ['a malformed quote id', 'abc'],
  ])('404 quote_not_found for %s', async (_label, quoteId) => {
    const { context, token } = await setUp();

    const response = await confirm(context, token, { quoteId });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'quote_not_found', message: expect.any(String) });
  });

  it("404 quote_not_found for another client's quote, which stays intact", async () => {
    const { context, token } = await setUp('sub-0001');
    const quote = await issueQuote(context, token);
    const intruder = await signInAndComplete(context, 'sub-0002');

    const response = await confirm(context, intruder, { quoteId: quote.quoteId });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('quote_not_found');
    expect(context.quoteRepository.all()).toHaveLength(1);
    expect(context.bookingRepository.all()).toHaveLength(0);
  });

  it('410 quote_expired once the 3 minutes have passed (before the database removes it)', async () => {
    const { context, token } = await setUp();
    const quote = await issueQuote(context, token);
    context.clock.set(quote.expiresAt);

    const response = await confirm(context, token, { quoteId: quote.quoteId });

    expect(response.status).toBe(410);
    expect(response.body.error).toBe('quote_expired');
    expect(context.bookingRepository.all()).toHaveLength(0);
  });

  it('409 duplicate_booking for a second quote of an already-booked match, with the existing booking id', async () => {
    const { context, token } = await setUp();
    const first = await issueQuote(context, token);
    const second = await issueQuote(context, token);
    const booked = await confirm(context, token, { quoteId: first.quoteId });

    const response = await confirm(context, token, { quoteId: second.quoteId });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: 'duplicate_booking',
      bookingId: booked.body.bookingId,
    });
    expect(context.bookingRepository.all()).toHaveLength(1);
    expect(context.quoteRepository.all().map((quote) => quote.id)).toEqual([second.quoteId]);
  });
});

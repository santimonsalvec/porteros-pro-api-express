import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';
import { POINTS, QUOTE_FORMAT_FIELDS } from '../../fixtures/quoteFixtures.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

/** Signs in and completes the client profile, so the token passes `requireCompleteProfile`. */
async function signInAndComplete(context: TestApp, sub: string): Promise<string> {
  context.googleValidator.registerValidCredential(
    `cred-${sub}`,
    new ExternalIdentity('google', sub, `${sub}@example.com`),
  );
  const exchange = await request(context.app)
    .post('/auth/sso/exchange')
    .send({ provider: 'google', platform: 'mobile', credential: `cred-${sub}` });
  const completion = await request(context.app)
    .post('/profile/complete')
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
  ...QUOTE_FORMAT_FIELDS,
};

async function issueQuote(context: TestApp, token: string, body: object = quoteBody) {
  const response = await request(context.app)
    .post('/goalkeeper-requests/quote')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  expect(response.status).toBe(200);
  return response.body as { quoteId: string; expiresAt: string; total: number };
}

function confirm(context: TestApp, token: string, body: unknown) {
  return request(context.app)
    .post('/goalkeeper-requests/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send(body as object);
}

async function setUp(sub = 'sub-0001') {
  const context = await buildTestApp();
  context.clock.set(NOW);
  const token = await signInAndComplete(context, sub);
  return { context, token };
}

describe('POST /goalkeeper-requests/bookings — Story 1: book at exactly the quoted price', () => {
  it('201 with a request that copies the quote, one booking per goalkeeper, and the quote is gone', async () => {
    const { context, token } = await setUp();
    const quote = await issueQuote(context, token);

    const response = await confirm(context, token, { quoteId: quote.quoteId });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      requestId: expect.any(String),
      quoteId: quote.quoteId,
      status: 'searching',
      partialFulfillment: 'keep_confirmed',
      latitude: POINTS.caliNorte.latitude,
      longitude: POINTS.caliNorte.longitude,
      zoneId: 'zone-cali-norte',
      cityId: 'city-cali',
      startsAt: '2026-09-21T20:00:00.000Z',
      startsAtLocal: '2026-09-21T15:00:00-05:00',
      timeZone: 'America/Bogota',
      goalkeeperCount: 2,
      durationMinutes: 90,
      matchFormat: { modality: 'futbol_11', level: 'competitive', surface: { id: 'synthetic_grass', name: 'Grama sintética' } },
      unitRate: 55000,
      subtotal: 110000,
      unitSurcharge: 5000,
      surcharge: 10000,
      total: 120000,
      currency: 'COP',
      cancellation: { freeCancellationUntil: '2026-09-21T19:00:00.000Z', freeCancellationAvailable: true },
      contactsVisibleFrom: '2026-09-21T19:00:00.000Z',
      createdAt: NOW,
      bookings: [
        { bookingId: expect.any(String), status: 'pending_assignment', unitRate: 55000, unitSurcharge: 5000, total: 60000, currency: 'COP', createdAt: NOW, goalkeeper: null, assignedAt: null, checkIn: null },
        { bookingId: expect.any(String), status: 'pending_assignment', unitRate: 55000, unitSurcharge: 5000, total: 60000, currency: 'COP', createdAt: NOW, goalkeeper: null, assignedAt: null, checkIn: null },
      ],
    });
    expect(context.quoteRepository.all()).toHaveLength(0);
    expect(context.requestRepository.all()).toHaveLength(1);
    expect(context.bookingRepository.all()).toHaveLength(2);
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
    const context = await buildTestApp();

    const response = await request(context.app)
      .post('/goalkeeper-requests/bookings')
      .send({ quoteId: 'x' });

    expect(response.status).toBe(401);
  });

  it('403 when the client profile is not complete', async () => {
    const context = await buildTestApp();
    context.googleValidator.registerValidCredential(
      'cred-new',
      new ExternalIdentity('google', 'sub-new', 'new@example.com'),
    );
    const exchange = await request(context.app)
      .post('/auth/sso/exchange')
      .send({ provider: 'google', platform: 'mobile', credential: 'cred-new' });

    const response = await confirm(context, exchange.body.accessToken as string, { quoteId: 'x' });

    expect(response.status).toBe(403);
  });
});

describe('POST /goalkeeper-requests/bookings — US1: one booking per goalkeeper', () => {
  it('201 with one booking per goalkeeper whose totals add up to the request total', async () => {
    const { context, token } = await setUp();
    const two = await issueQuote(context, token);
    const one = await issueQuote(context, token, { ...quoteBody, goalkeeperCount: 1, startsAt: '2026-09-21T16:00:00' });

    const pair = await confirm(context, token, { quoteId: two.quoteId });
    const single = await confirm(context, token, { quoteId: one.quoteId });

    expect(pair.status).toBe(201);
    expect(pair.body.bookings).toHaveLength(2);
    expect(pair.body.bookings.reduce((sum: number, booking: { total: number }) => sum + booking.total, 0)).toBe(pair.body.total);
    expect(single.status).toBe(201);
    expect(single.body.bookings).toHaveLength(1);
    expect(single.body.bookings[0].total).toBe(single.body.total);
  });
});

describe('POST /goalkeeper-requests/bookings — US3: partial-confirmation preference', () => {
  it('echoes keep_confirmed by default and cancel_all when chosen', async () => {
    const { context, token } = await setUp();
    const first = await issueQuote(context, token);
    const second = await issueQuote(context, token, { ...quoteBody, startsAt: '2026-09-21T16:00:00' });

    const byDefault = await confirm(context, token, { quoteId: first.quoteId });
    const chosen = await confirm(context, token, { quoteId: second.quoteId, partialFulfillment: 'cancel_all' });

    expect(byDefault.body.partialFulfillment).toBe('keep_confirmed');
    expect(chosen.body.partialFulfillment).toBe('cancel_all');
  });

  it('400 validation_failed for an unknown preference, storing nothing', async () => {
    const { context, token } = await setUp();
    const quote = await issueQuote(context, token);

    const response = await confirm(context, token, { quoteId: quote.quoteId, partialFulfillment: 'all' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_failed');
    expect(response.body.fieldErrors).toHaveProperty('partialFulfillment');
    expect(context.requestRepository.all()).toHaveLength(0);
    expect(context.quoteRepository.all()).toHaveLength(1);
  });
});

describe('POST /goalkeeper-requests/bookings — US6: late-confirmation notice', () => {
  it('reports that assigned bookings cannot be cancelled for a match starting within the free-cancellation period', async () => {
    const { context, token } = await setUp();
    // Now 13:30 Bogotá; the match starts at 14:00 (30 minutes, the minimum notice) → inside the 60-minute period.
    const quote = await issueQuote(context, token, { ...quoteBody, startsAt: '2026-09-21T14:00:00' });

    const response = await confirm(context, token, { quoteId: quote.quoteId });

    expect(response.status).toBe(201);
    expect(response.body.cancellation).toEqual({
      freeCancellationUntil: '2026-09-21T18:00:00.000Z',
      freeCancellationAvailable: false,
    });
  });
});

describe('POST /goalkeeper-requests/bookings — Story 2: retries are safe', () => {
  it('201 then 200 with the identical booking', async () => {
    const { context, token } = await setUp();
    const quote = await issueQuote(context, token);

    const first = await confirm(context, token, { quoteId: quote.quoteId });
    const retry = await confirm(context, token, { quoteId: quote.quoteId });

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
  });

  it('a double tap creates one request and both answers name the same request and bookings', async () => {
    const { context, token } = await setUp();
    const quote = await issueQuote(context, token);

    const [a, b] = await Promise.all([
      confirm(context, token, { quoteId: quote.quoteId }),
      confirm(context, token, { quoteId: quote.quoteId }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.requestId).toBe(b.body.requestId);
    expect(a.body.bookings).toEqual(b.body.bookings);
    expect(context.requestRepository.all()).toHaveLength(1);
    expect(context.bookingRepository.all()).toHaveLength(2);
  });

  it('a sequential retry answers 200 with the same request and bookings, creating nothing', async () => {
    const { context, token } = await setUp();
    const quote = await issueQuote(context, token);
    const first = await confirm(context, token, { quoteId: quote.quoteId });

    const retry = await confirm(context, token, { quoteId: quote.quoteId });

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(context.requestRepository.all()).toHaveLength(1);
    expect(context.bookingRepository.all()).toHaveLength(2);
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

describe('POST /goalkeeper-requests/bookings — Story 4: refusals are clear and change nothing', () => {
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

  it('409 duplicate_request for a second quote of an already-requested match, with the existing request id', async () => {
    const { context, token } = await setUp();
    const first = await issueQuote(context, token);
    const second = await issueQuote(context, token);
    const booked = await confirm(context, token, { quoteId: first.quoteId });

    const response = await confirm(context, token, { quoteId: second.quoteId });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: 'duplicate_request',
      requestId: booked.body.requestId,
    });
    expect(context.requestRepository.all()).toHaveLength(1);
    expect(context.quoteRepository.all().map((quote) => quote.id)).toEqual([second.quoteId]);
  });
});

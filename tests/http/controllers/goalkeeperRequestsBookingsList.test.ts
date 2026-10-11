import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';
import { buildRequest, buildRequestBookings, POINTS, QUOTE_FORMAT_FIELDS } from '../../fixtures/quoteFixtures.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper } from '../walletTestHelpers.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

const NOW = '2026-09-25T18:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(new Date(NOW).getTime() + offsetMs);

/** Signs in and completes the client profile, so the token passes `requireCompleteProfile`. */
async function signInAndComplete(context: TestApp, sub: string): Promise<{ token: string; clientId: string }> {
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
  const token = completion.body.accessToken as string;
  const me = await request(context.app).get('/auth/me').set('Authorization', `Bearer ${token}`);
  return { token, clientId: me.body.userId as string };
}

async function setUp(sub = 'sub-0001') {
  const context = await buildTestApp();
  context.clock.set(NOW);
  const client = await signInAndComplete(context, sub);
  return { context, ...client };
}

function list(context: TestApp, token: string, query = '') {
  return request(context.app)
    .get(`/goalkeeper-requests/bookings${query}`)
    .set('Authorization', `Bearer ${token}`);
}

const ids = (body: { items: { requestId: string }[] }) => body.items.map((item) => item.requestId);

/** Stores a request and its bookings in the test app, as a confirmation would. */
function seedRequest(context: TestApp, request: ReturnType<typeof buildRequest>) {
  context.requestRepository.seed(request);
  buildRequestBookings(request).forEach((booking) => context.bookingRepository.seed(booking));
}

describe('GET /goalkeeper-requests/bookings — Story 1: the client sees their bookings', () => {
  it('200 with the confirmed booking exactly as confirmed, plus the zone and city names', async () => {
    const { context, token } = await setUp();
    context.clock.set('2026-09-21T18:30:00.000Z');
    const quote = await request(context.app)
      .post('/goalkeeper-requests/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...POINTS.caliNorte, startsAt: '2026-09-21T15:00:00', goalkeeperCount: 2, durationMinutes: 90, ...QUOTE_FORMAT_FIELDS });
    const confirmed = await request(context.app)
      .post('/goalkeeper-requests/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ quoteId: quote.body.quoteId });
    expect(confirmed.status).toBe(201);

    const response = await list(context, token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [{ ...confirmed.body, zoneName: 'Norte', cityName: 'Cali' }],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
  });

  it('lists one item per match, each carrying its bookings', async () => {
    const { context, token, clientId } = await setUp();
    seedRequest(context, buildRequest('pair', at(DAY), { clientId }));
    seedRequest(context, buildRequest('solo', at(2 * DAY), { clientId, goalkeeperCount: 1 }));

    const response = await list(context, token);

    expect(response.body.totalItems).toBe(2);
    expect(response.body.items.map((item: { requestId: string; bookings: unknown[] }) => [item.requestId, item.bookings.length])).toEqual([
      ['pair', 2],
      ['solo', 1],
    ]);
  });

  it('lists upcoming matches soonest first, then past matches most recent first', async () => {
    const { context, token, clientId } = await setUp();
    seedRequest(context, buildRequest('past-5d', at(-5 * DAY), { clientId }));
    seedRequest(context, buildRequest('in-10d', at(10 * DAY), { clientId }));
    seedRequest(context, buildRequest('tomorrow', at(DAY), { clientId }));

    const response = await list(context, token);

    expect(ids(response.body)).toEqual(['tomorrow', 'in-10d', 'past-5d']);
  });

  it('200 with an empty list and zero totals for a client without bookings', async () => {
    const { context, token } = await setUp();

    const response = await list(context, token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  });
});

describe('GET /goalkeeper-requests/bookings — Story 2: only the caller’s bookings', () => {
  it('ignores a clientId or userId in the query and lists only the caller’s bookings', async () => {
    const { context, token, clientId } = await setUp('sub-0001');
    const other = await signInAndComplete(context, 'sub-0002');
    seedRequest(context, buildRequest('a-1', at(DAY), { clientId }));
    seedRequest(context, buildRequest('a-2', at(-DAY), { clientId }));
    for (let i = 0; i < 5; i++) {
      seedRequest(context, buildRequest(`b-${i}`, at((i + 1) * DAY), { clientId: other.clientId }));
    }

    const response = await list(context, token, `?clientId=${other.clientId}&userId=${other.clientId}`);

    expect(response.status).toBe(200);
    expect(ids(response.body)).toEqual(['a-1', 'a-2']);
    expect(response.body.totalItems).toBe(2);
  });

  it('401 without a token', async () => {
    const context = await buildTestApp();

    const response = await request(context.app).get('/goalkeeper-requests/bookings');

    expect(response.status).toBe(401);
    expect(response.text).toBe('');
  });

  it('401 with an invalid token', async () => {
    const context = await buildTestApp();

    const response = await list(context, 'not-a-token');

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

    const response = await list(context, exchange.body.accessToken as string);

    expect(response.status).toBe(403);
  });
});

describe('GET /goalkeeper-requests/bookings — Story 3: page by page', () => {
  it.each([
    ['?page=0', 'page'],
    ['?page=-1', 'page'],
    ['?page=abc', 'page'],
    ['?page=1.5', 'page'],
    ['?page=', 'page'],
    ['?page=1&page=2', 'page'],
    ['?pageSize=0', 'pageSize'],
    ['?pageSize=51', 'pageSize'],
    ['?pageSize=1e1', 'pageSize'],
  ])('400 validation_failed for %s, naming %s', async (query, field) => {
    const { context, token } = await setUp();

    const response = await list(context, token, query);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_failed');
    expect(response.body.fieldErrors).toHaveProperty(field);
  });

  it('accepts the largest page size', async () => {
    const { context, token } = await setUp();

    const response = await list(context, token, '?pageSize=50');

    expect(response.status).toBe(200);
    expect(response.body.pageSize).toBe(50);
  });

  it('200 with an empty page and the real totals past the last page', async () => {
    const { context, token, clientId } = await setUp();
    for (let i = 0; i < 3; i++) seedRequest(context, buildRequest(`bk-${i}`, at((i + 1) * DAY), { clientId }));

    const response = await list(context, token, '?page=999&pageSize=2');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], page: 999, pageSize: 2, totalItems: 3, totalPages: 2 });
  });
});

describe('GET /goalkeeper-requests/bookings — 012 US5: the assigned goalkeeper\'s contact', () => {
  it('shows only name and WhatsApp of the goalkeeper who accepted, and null on the open booking', async () => {
    const context = await buildTestApp();
    context.clock.set(MATCH_NOW);
    const client = await signInClient(context, 'sub-0501');
    const goalkeeper = await signInGoalkeeper(context, 'sub-0502');
    await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo', operationKey: 'k-gk' });
    const created = await createRequestAsClient(context, client.token);
    const taken = created.bookings[0]!.bookingId;
    await request(context.app).post(`/goalkeepers/me/bookings/${taken}/accept`).set('Authorization', `Bearer ${goalkeeper.token}`);
    context.clock.set('2026-09-21T19:00:00.000Z'); // the goalkeeper's contact shows from one hour before (feature 019)

    const response = await request(context.app).get('/goalkeeper-requests/bookings').set('Authorization', `Bearer ${client.token}`);

    expect(response.status).toBe(200);
    const [item] = response.body.items;
    expect(item.status).toBe('partially_assigned');
    const assigned = item.bookings.find((booking: { bookingId: string }) => booking.bookingId === taken);
    const open = item.bookings.find((booking: { bookingId: string }) => booking.bookingId !== taken);
    expect(assigned.goalkeeper).toEqual({ firstName: 'Ana', lastName: 'Portera', whatsApp: '+57 300 000 0502' });
    expect(assigned.assignedAt).toBe(MATCH_NOW);
    expect(open).toMatchObject({ goalkeeper: null, assignedAt: null });
    expect(JSON.stringify(response.body)).not.toMatch(/@|email|document/i);
  });
});

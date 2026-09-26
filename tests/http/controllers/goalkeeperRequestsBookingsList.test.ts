import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';
import { User } from '../../../src/domain/users/user.js';
import { buildBooking, POINTS } from '../../fixtures/quoteFixtures.js';

type TestApp = ReturnType<typeof buildTestApp>;

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
  const token = completion.body.accessToken as string;
  const me = await request(context.app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  return { token, clientId: me.body.userId as string };
}

async function setUp(sub = 'sub-0001') {
  const context = buildTestApp();
  context.clock.set(NOW);
  const client = await signInAndComplete(context, sub);
  return { context, ...client };
}

function list(context: TestApp, token: string, query = '') {
  return request(context.app)
    .get(`/api/goalkeeper-requests/bookings${query}`)
    .set('Authorization', `Bearer ${token}`);
}

const ids = (body: { items: { bookingId: string }[] }) => body.items.map((item) => item.bookingId);

describe('GET /api/goalkeeper-requests/bookings — Story 1: the client sees their bookings', () => {
  it('200 with the confirmed booking exactly as confirmed, plus the zone and city names', async () => {
    const { context, token } = await setUp();
    context.clock.set('2026-09-21T18:30:00.000Z');
    const quote = await request(context.app)
      .post('/api/goalkeeper-requests/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...POINTS.caliNorte, startsAt: '2026-09-21T15:00:00', goalkeeperCount: 2, durationMinutes: 90 });
    const confirmed = await request(context.app)
      .post('/api/goalkeeper-requests/bookings')
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

  it('lists upcoming matches soonest first, then past matches most recent first', async () => {
    const { context, token, clientId } = await setUp();
    context.bookingRepository.seed(buildBooking('past-5d', at(-5 * DAY), { clientId }));
    context.bookingRepository.seed(buildBooking('in-10d', at(10 * DAY), { clientId }));
    context.bookingRepository.seed(buildBooking('tomorrow', at(DAY), { clientId }));

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

describe('GET /api/goalkeeper-requests/bookings — Story 2: only the caller’s bookings', () => {
  it('ignores a clientId or userId in the query and lists only the caller’s bookings', async () => {
    const { context, token, clientId } = await setUp('sub-0001');
    const other = await signInAndComplete(context, 'sub-0002');
    context.bookingRepository.seed(buildBooking('a-1', at(DAY), { clientId }));
    context.bookingRepository.seed(buildBooking('a-2', at(-DAY), { clientId }));
    for (let i = 0; i < 5; i++) {
      context.bookingRepository.seed(buildBooking(`b-${i}`, at((i + 1) * DAY), { clientId: other.clientId }));
    }

    const response = await list(context, token, `?clientId=${other.clientId}&userId=${other.clientId}`);

    expect(response.status).toBe(200);
    expect(ids(response.body)).toEqual(['a-1', 'a-2']);
    expect(response.body.totalItems).toBe(2);
  });

  it('401 without a token', async () => {
    const context = buildTestApp();

    const response = await request(context.app).get('/api/goalkeeper-requests/bookings');

    expect(response.status).toBe(401);
    expect(response.text).toBe('');
  });

  it('401 with an invalid token', async () => {
    const context = buildTestApp();

    const response = await list(context, 'not-a-token');

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

    const response = await list(context, exchange.body.accessToken as string);

    expect(response.status).toBe(403);
  });

  it('403 for an admin account', async () => {
    const context = buildTestApp();
    await context.userRepository.add(
      User.createFromExternalIdentity({ id: 'admin-1', email: 'admin@example.com', displayName: null, provider: 'google', subject: 'admin-sub', isAdmin: true }),
    );
    context.googleValidator.registerValidCredential('admin-cred', new ExternalIdentity('google', 'admin-sub', 'admin@example.com'));
    const exchange = await request(context.app)
      .post('/api/auth/sso/exchange')
      .send({ provider: 'google', platform: 'admin-web', credential: 'admin-cred' });

    const response = await list(context, exchange.body.accessToken as string);

    expect(response.status).toBe(403);
  });
});

describe('GET /api/goalkeeper-requests/bookings — Story 3: page by page', () => {
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
    for (let i = 0; i < 3; i++) context.bookingRepository.seed(buildBooking(`bk-${i}`, at((i + 1) * DAY), { clientId }));

    const response = await list(context, token, '?page=999&pageSize=2');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], page: 999, pageSize: 2, totalItems: 3, totalPages: 2 });
  });
});

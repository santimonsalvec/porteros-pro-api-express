import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, TEST_INTERNAL_TOKEN } from '../testAppFactory.js';
import { signInClient, type TestApp } from '../walletTestHelpers.js';
import { closedMatchSetUp } from '../closeHelpers.js';

const get = (context: TestApp, token: string, path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`);
const rate = (context: TestApp, token: string, bookingId: string, body: object) =>
  request(context.app).post(`/api/ratings/bookings/${bookingId}`).set('Authorization', `Bearer ${token}`).send(body);

describe('ratings — US2 (feature 021)', () => {
  it('lists the pending rating for both sides, rates once each, and refuses repeats and strangers', async () => {
    const { context, client, g, bookingId } = await closedMatchSetUp();
    context.clock.set('2026-09-21T23:30:00.000Z');
    await request(context.app).post('/internal/sweep').set('Authorization', `Bearer ${TEST_INTERNAL_TOKEN}`);

    expect((await get(context, client.token, '/api/ratings/pending')).body.items).toMatchObject([{ bookingId, side: 'client', question: 'goalkeeper_arrived' }]);
    expect((await get(context, g.token, '/api/ratings/pending')).body.items).toMatchObject([{ bookingId, side: 'goalkeeper', question: 'payment_received' }]);

    const rated = await rate(context, client.token, bookingId, { answer: true, stars: 5, comment: 'Excelente' });
    expect(rated.status).toBe(201);
    expect(rated.body).toMatchObject({ bookingId, side: 'client', answer: true, stars: 5, comment: 'Excelente' });
    expect((await rate(context, g.token, bookingId, { answer: true, stars: 4 })).status).toBe(201);
    expect((await rate(context, client.token, bookingId, { answer: true, stars: 5 })).body.error).toBe('already_rated');
    expect((await rate(context, client.token, bookingId, { answer: 'yes', stars: 5 })).status).toBe(400);
    const stranger = await signInClient(context, 'sub-2109');
    expect((await rate(context, stranger.token, bookingId, { answer: true, stars: 5 })).body.error).toBe('booking_not_found');
    expect((await get(context, client.token, '/api/ratings/pending')).body.items).toEqual([]);
  });

  it('refuses rating before the match ended without a check-in', async () => {
    const { context, client, bookingId } = await closedMatchSetUp();

    const early = await rate(context, client.token, bookingId, { answer: true, stars: 5 });

    expect(early.status).toBe(409);
    expect(early.body).toMatchObject({ error: 'not_rateable', reason: 'not_finished' });
  });

  it('documents the ratings and cases endpoints', async () => {
    const context = await buildTestApp();
    const paths = Object.keys((await request(context.app).get('/openapi.json')).body.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/ratings/pending',
        '/api/ratings/bookings/{bookingId}',
        '/api/admin/cases',
        '/api/admin/cases/{caseId}',
        '/api/admin/cases/{caseId}/resolve',
      ]),
    );
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, TEST_INTERNAL_TOKEN } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

const tinyJpeg = readFileSync(fileURLToPath(new URL('../../fixtures/tinyImage.jpg', import.meta.url)));

const upload = async (context: TestApp, token: string) =>
  (await request(context.app).post('/images').set('Authorization', `Bearer ${token}`).attach('image', tinyJpeg, 'photo.jpg')).body.id as string;
const checkIn = (context: TestApp, token: string, bookingId: string, body: object) =>
  request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/check-in`).set('Authorization', `Bearer ${token}`).send(body);
const sweep = (context: TestApp) => request(context.app).post('/internal/sweep').set('Authorization', `Bearer ${TEST_INTERNAL_TOKEN}`);

/** G holds the only booking of a 22:00Z match: the window runs 21:30Z–22:15Z, the last call at 22:05Z. */
async function setUp() {
  const context = await buildTestApp({ eventsMode: 'local' });
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-2001');
  const g = await signInGoalkeeper(context, 'sub-2002');
  await context.walletLedger.adjust(ownerOf(g.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo', operationKey: 'k-g' });
  const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 1, startsAt: '2026-09-21T17:00:00' });
  const bookingId = created.bookings[0]!.bookingId;
  expect((await request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/accept`).set('Authorization', `Bearer ${g.token}`)).status).toBe(201);
  const inbox = (userId: string, type: string) => context.notificationRepository.all().filter((item) => item.userId === userId && item.type === type);
  return { context, client, g, bookingId, inbox };
}

describe('goalkeeper check-in — US1: check in with a photo', () => {
  it('records the check-in with the photo and the distance, idempotently', async () => {
    const { context, g, bookingId } = await setUp();
    const imageId = await upload(context, g.token);
    context.clock.set('2026-09-21T21:45:00.000Z');

    const response = await checkIn(context, g.token, bookingId, { imageId, location: { latitude: 3.45, longitude: -76.5, accuracyMeters: 10 } });

    expect(response.status).toBe(200);
    expect(response.body.checkIn).toEqual({ at: '2026-09-21T21:45:00.000Z', photoUrl: expect.stringMatching(/^https?:\/\//), distanceMeters: expect.any(Number) });
    const again = await checkIn(context, g.token, bookingId, { imageId });
    expect(again.status).toBe(200);
    expect(again.body.checkIn.at).toBe('2026-09-21T21:45:00.000Z');
  });

  it('refuses outside the window, other people’s photos, bad coordinates and non-goalkeepers', async () => {
    const { context, client, g, bookingId } = await setUp();
    const imageId = await upload(context, g.token);

    context.clock.set('2026-09-21T21:29:00.000Z');
    expect((await checkIn(context, g.token, bookingId, { imageId })).body).toMatchObject({ error: 'check_in_not_open', opensAt: '2026-09-21T21:30:00.000Z' });
    context.clock.set('2026-09-21T22:16:00.000Z');
    expect((await checkIn(context, g.token, bookingId, { imageId })).body).toMatchObject({ error: 'check_in_closed', closedAt: '2026-09-21T22:15:00.000Z' });

    context.clock.set('2026-09-21T21:45:00.000Z');
    const theirs = await upload(context, client.token);
    expect((await checkIn(context, g.token, bookingId, { imageId: theirs })).body.error).toBe('invalid_photo');
    expect((await checkIn(context, g.token, bookingId, { imageId, location: { latitude: 91, longitude: 0 } })).status).toBe(400);
    expect((await checkIn(context, g.token, bookingId, {})).status).toBe(400);
    expect((await checkIn(context, client.token, bookingId, { imageId: theirs })).body.error).toBe('goalkeeper_not_found');
  });
});

describe('goalkeeper check-in — US2: the client sees the arrival', () => {
  it('shows the time and the photo, never the location, and tells the client once', async () => {
    const { context, client, g, bookingId, inbox } = await setUp();
    const imageId = await upload(context, g.token);
    context.clock.set('2026-09-21T21:45:00.000Z');
    await checkIn(context, g.token, bookingId, { imageId, location: { latitude: 3.4611, longitude: -76.5123, accuracyMeters: 7 } });
    await checkIn(context, g.token, bookingId, { imageId });

    const view = await request(context.app).get('/goalkeeper-requests/bookings').set('Authorization', `Bearer ${client.token}`);

    expect(view.body.items[0].bookings[0].checkIn).toEqual({ at: '2026-09-21T21:45:00.000Z', photoUrl: expect.any(String) });
    expect(JSON.stringify(view.body)).not.toMatch(/distanceMeters|3\.4611|-76\.5123|accuracy/);
    expect(inbox(client.userId, 'booking.goalkeeper_arrived')).toHaveLength(1);
  });
});

describe('goalkeeper check-in — US3 and US4: the sweep', () => {
  it('reminds the goalkeeper twice and tells the client when there is no check-in, once each', async () => {
    const { context, client, g, inbox } = await setUp();

    context.clock.set('2026-09-21T21:30:00.000Z');
    await sweep(context);
    await sweep(context);
    expect(inbox(g.userId, 'booking.check_in_open')).toHaveLength(1);

    context.clock.set('2026-09-21T22:05:00.000Z');
    await sweep(context);
    expect(inbox(g.userId, 'booking.check_in_last_call')).toHaveLength(1);

    context.clock.set('2026-09-21T22:16:00.000Z');
    await sweep(context);
    await sweep(context);
    const missed = inbox(client.userId, 'booking.check_in_missed');
    expect(missed).toHaveLength(1);
    expect(missed[0]!.body).toMatch(/WhatsApp \+57 /);
  });
});

describe('check-in in the API document', () => {
  it('documents the check-in endpoint', async () => {
    const context = await buildTestApp();
    const paths = Object.keys((await request(context.app).get('/openapi.json')).body.paths);
    expect(paths).toContain('/goalkeepers/me/bookings/{bookingId}/check-in');
  });
});


import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../operatingBalanceTestHelpers.js';

const tinyJpeg = readFileSync(fileURLToPath(new URL('../../fixtures/tinyImage.jpg', import.meta.url)));

const get = (context: TestApp, path: string, token?: string) => {
  const pending = request(context.app).get(path);
  return token ? pending.set('Authorization', `Bearer ${token}`) : pending;
};

/** A client's request for two goalkeepers in Cali: G takes the first booking and checks in. */
async function world() {
  const context = await buildTestApp({ eventsMode: 'local' });
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-3001');
  const g = await signInGoalkeeper(context, 'sub-3002');
  await context.operatingBalanceLedger.adjust(ownerOf(g.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo', operationKey: 'k-g' });
  const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 2, startsAt: '2026-09-21T17:00:00' });
  const requestId = created.requestId as string;
  const [first, second] = created.bookings.map((booking: { bookingId: string }) => booking.bookingId) as [string, string];
  expect((await request(context.app).post(`/goalkeepers/me/bookings/${first}/accept`).set('Authorization', `Bearer ${g.token}`)).status).toBe(201);
  const imageId = (await request(context.app).post('/images').set('Authorization', `Bearer ${g.token}`).attach('image', tinyJpeg, 'photo.jpg')).body.id as string;
  context.clock.set('2026-09-21T21:45:00.000Z');
  const checkedIn = await request(context.app).post(`/goalkeepers/me/bookings/${first}/check-in`).set('Authorization', `Bearer ${g.token}`).send({ imageId });
  expect(checkedIn.status).toBe(200);
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  return { context, client, g, owner, requestId, first, second };
}

describe('admin requests (spec 006 of the admin, US1)', () => {
  it('lists requests with their status, filtered, without phones', async () => {
    const { context, client, g, owner, requestId } = await world();

    const all = await get(context, '/admin/requests', owner.token);
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ page: 1, pageSize: 20, totalItems: 1 });
    expect(all.body.items[0]).toMatchObject({
      requestId,
      client: { userId: client.userId, name: expect.any(String) },
      goalkeepersRequested: 2,
      goalkeepersAssigned: 1,
      status: 'partially_assigned',
      match: { timeZone: expect.any(String), market: { id: expect.any(String) }, zone: { id: 'zone-cali-norte' } },
    });
    expect(JSON.stringify(all.body)).not.toMatch(/whatsApp|phone/i);

    expect((await get(context, '/admin/requests?status=partially_assigned', owner.token)).body.totalItems).toBe(1);
    expect((await get(context, '/admin/requests?status=completed', owner.token)).body.totalItems).toBe(0);
    expect((await get(context, `/admin/requests?goalkeeperId=${g.userId}`, owner.token)).body.totalItems).toBe(1);
    expect((await get(context, `/admin/requests?clientId=someone-else`, owner.token)).body.totalItems).toBe(0);
    expect((await get(context, '/admin/requests?from=2026-09-22T00:00:00.000Z', owner.token)).body.totalItems).toBe(0);
    expect((await get(context, '/admin/requests?zoneId=zone-cali-norte&pageSize=5', owner.token)).body).toMatchObject({ pageSize: 5, totalItems: 1 });
  });

  it('refuses a malformed query', async () => {
    const { context, owner } = await world();

    for (const query of ['status=lost', 'from=21-09-2026', 'from=2026-09-22T00:00:00.000Z&to=2026-09-21T00:00:00.000Z', 'pageSize=500', 'page=0']) {
      const response = await get(context, `/admin/requests?${query}`, owner.token);
      expect(response.status, query).toBe(400);
      expect(response.body.error).toBe('validation_failed');
    }
  });

  it('answers the detail with every fact, the check-in without its photo, and 404 for nothing', async () => {
    const { context, g, owner, requestId, first, second } = await world();

    const detail = await get(context, `/admin/requests/${requestId}`, owner.token);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ requestId, status: 'partially_assigned', pricing: { currency: 'COP' }, offersSent: expect.any(Number) });
    const bookings = detail.body.bookings as { bookingId: string }[];
    expect(bookings.map((booking) => booking.bookingId).sort()).toEqual([first, second].sort());
    expect(bookings.find((booking) => booking.bookingId === first)).toMatchObject({
      status: 'assigned',
      goalkeeper: { userId: g.userId },
      checkIn: { at: '2026-09-21T21:45:00.000Z', hasPhoto: true },
      money: { charged: expect.any(Number), currency: 'COP' },
    });
    expect(JSON.stringify(detail.body)).not.toMatch(/photoUrl|https?:\/\/[^"]*\.(jpg|png)/);

    const missing = await get(context, '/admin/requests/nope', owner.token);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('request_not_found');
  });

  it('shows the check-in photo as a sensitive read: who looked, never the photo', async () => {
    const { context, owner, requestId, first, second } = await world();
    context.adminAuditLog.entries.length = 0;

    const photo = await get(context, `/admin/requests/${requestId}/bookings/${first}/check-in-photo`, owner.token);
    expect(photo.status).toBe(200);
    expect(photo.body).toEqual({ photoUrl: expect.stringMatching(/^https?:\/\//), at: '2026-09-21T21:45:00.000Z' });
    expect(context.adminAuditLog.entries).toHaveLength(1);
    const [entry] = context.adminAuditLog.entries;
    expect(entry).toMatchObject({ kind: 'read', action: 'booking.check_in_photo.read', resourceType: 'booking', resourceId: first, permission: 'requests.read', outcome: 'done' });
    expect(JSON.stringify(entry)).not.toContain(photo.body.photoUrl);

    const none = await get(context, `/admin/requests/${requestId}/bookings/${second}/check-in-photo`, owner.token);
    expect(none.status).toBe(404);
    expect(none.body.error).toBe('check_in_not_found');
    const elsewhere = await get(context, `/admin/requests/other/bookings/${first}/check-in-photo`, owner.token);
    expect(elsewhere.status).toBe(404);
    expect(elsewhere.body.error).toBe('booking_not_found');
    // As every sensitive read of spec 001: a refused one is recorded as rejected, still without data.
    expect(context.adminAuditLog.entries.slice(1).map((item) => item.outcome)).toEqual(['rejected', 'rejected']);
  });

  it('refuses without a session, without requests.read, and with an app token; a refused photo leaves no read', async () => {
    const { context, client, requestId, first } = await world();
    await seedRole(context, 'soporte', ['cases.read']);
    const support = await signInStaff(context, { key: 'support', userId: 'support-user', roleId: 'soporte' });
    context.adminAuditLog.entries.length = 0;

    expect((await get(context, '/admin/requests')).status).toBe(401);
    expect((await get(context, '/admin/requests', client.token)).status).toBe(401);
    const denied = await get(context, `/admin/requests/${requestId}/bookings/${first}/check-in-photo`, support.token);
    expect(denied.status).toBe(403);
    expect(context.adminAuditLog.entries).toEqual([expect.objectContaining({ outcome: 'denied', permission: 'requests.read' })]);
  });
});

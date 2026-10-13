import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { TEST_INTERNAL_TOKEN } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { closedMatchSetUp } from '../closeHelpers.js';
import type { TestApp } from '../walletTestHelpers.js';

const tinyJpeg = readFileSync(fileURLToPath(new URL('../../fixtures/tinyImage.jpg', import.meta.url)));
const get = (context: TestApp, token: string, path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`);

/** G checks in, the match closes, the client says G didn't come and G says they weren't paid: two cases. */
async function world() {
  const { context, client, g, bookingId, requestId } = await closedMatchSetUp();
  const imageId = (await request(context.app).post('/images').set('Authorization', `Bearer ${g.token}`).attach('image', tinyJpeg, 'photo.jpg')).body.id as string;
  context.clock.set('2026-09-21T21:45:00.000Z');
  expect((await request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/check-in`).set('Authorization', `Bearer ${g.token}`).send({ imageId })).status).toBe(200);
  context.clock.set('2026-09-21T23:30:00.000Z');
  await request(context.app).post('/internal/sweep').set('Authorization', `Bearer ${TEST_INTERNAL_TOKEN}`);
  expect((await request(context.app).post(`/ratings/bookings/${bookingId}`).set('Authorization', `Bearer ${client.token}`).send({ answer: false, stars: 1, comment: 'No vino' })).status).toBe(201);
  context.clock.set('2026-09-21T23:40:00.000Z');
  expect((await request(context.app).post(`/ratings/bookings/${bookingId}`).set('Authorization', `Bearer ${g.token}`).send({ answer: false, stars: 2 })).status).toBe(201);
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  return { context, client, g, bookingId, requestId, owner };
}

describe('admin cases filters and evidence (spec 006 of the admin, US2)', () => {
  it('keeps the list as it was without the new filters, with the match and names added', async () => {
    const { context, owner, client, g, requestId } = await world();

    const all = await get(context, owner.token, '/admin/cases');
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ page: 1, pageSize: 20, totalItems: 2 });
    // 021's order: open first, then newest.
    expect(all.body.items.map((item: { type: string }) => item.type)).toEqual(['payment_not_received', 'goalkeeper_no_show']);
    expect(all.body.items[0]).toMatchObject({
      requestId,
      match: { startsAt: expect.any(String), timeZone: expect.any(String) },
      client: { userId: client.userId },
      goalkeeper: { userId: g.userId },
    });
  });

  it('filters by type, opening dates and country, oldest first on demand', async () => {
    const { context, owner } = await world();

    expect((await get(context, owner.token, '/admin/cases?type=goalkeeper_no_show')).body.items.map((item: { type: string }) => item.type)).toEqual(['goalkeeper_no_show']);
    expect((await get(context, owner.token, '/admin/cases?order=oldest')).body.items.map((item: { type: string }) => item.type)).toEqual(['goalkeeper_no_show', 'payment_not_received']);
    expect((await get(context, owner.token, '/admin/cases?from=2026-09-21T23:35:00.000Z')).body.totalItems).toBe(1);
    expect((await get(context, owner.token, '/admin/cases?to=2026-09-21T23:35:00.000Z')).body.totalItems).toBe(1);
    expect((await get(context, owner.token, '/admin/cases?countryId=nowhere')).body.totalItems).toBe(0);
    for (const query of ['type=other', 'order=newest', 'from=ayer', 'from=2026-09-22T00:00:00.000Z&to=2026-09-21T00:00:00.000Z']) {
      const response = await get(context, owner.token, `/admin/cases?${query}`);
      expect(response.status, query).toBe(400);
      expect(response.body.error).toBe('validation_failed');
    }
  });

  it('gives the detail with the booking and the check-in, never the photo', async () => {
    const { context, owner, bookingId } = await world();
    const caseId = (await get(context, owner.token, '/admin/cases?type=goalkeeper_no_show')).body.items[0].caseId as string;

    const detail = await get(context, owner.token, `/admin/cases/${caseId}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      caseId,
      rating: { answer: false, stars: 1, comment: 'No vino' },
      checkIn: { at: '2026-09-21T21:45:00.000Z', hasPhoto: true },
      booking: { bookingId, status: 'completed' },
    });
    expect(JSON.stringify(detail.body)).not.toMatch(/photoUrl/);
  });

  it("shows the case's check-in photo as a sensitive read", async () => {
    const { context, owner, bookingId } = await world();
    const caseId = (await get(context, owner.token, '/admin/cases?type=goalkeeper_no_show')).body.items[0].caseId as string;
    const unpaid = (await get(context, owner.token, '/admin/cases?type=payment_not_received')).body.items[0].caseId as string;
    context.adminAuditLog.entries.length = 0;

    const photo = await get(context, owner.token, `/admin/cases/${caseId}/check-in-photo`);
    expect(photo.status).toBe(200);
    expect(photo.body).toEqual({ photoUrl: expect.stringMatching(/^https?:\/\//), at: '2026-09-21T21:45:00.000Z' });
    expect(context.adminAuditLog.entries).toEqual([
      expect.objectContaining({ kind: 'read', action: 'booking.check_in_photo.read', resourceType: 'case', resourceId: caseId, permission: 'cases.read', outcome: 'done' }),
    ]);
    expect(JSON.stringify(context.adminAuditLog.entries)).not.toContain(photo.body.photoUrl);
    // The goalkeeper's own case is about the same booking: it has the same check-in.
    expect((await get(context, owner.token, `/admin/cases/${unpaid}/check-in-photo`)).status).toBe(200);
    expect(bookingId).toBeTruthy();

    const missing = await get(context, owner.token, '/admin/cases/missing/check-in-photo');
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('case_not_found');
  });

  it('refuses the photo without cases.read', async () => {
    const { context } = await world();
    await seedRole(context, 'soporte', ['requests.read']);
    const support = await signInStaff(context, { key: 'support', userId: 'support-user', roleId: 'soporte' });

    expect((await get(context, support.token, '/admin/cases/any/check-in-photo')).status).toBe(403);
  });
});

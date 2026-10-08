import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { TEST_INTERNAL_TOKEN } from '../testAppFactory.js';
import { signInAdmin, type TestApp } from '../walletTestHelpers.js';
import { closedMatchSetUp } from '../closeHelpers.js';

const get = (context: TestApp, token: string, path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`);

describe('admin cases — US4 (feature 021)', () => {
  it("opens a case on the client's \"no\", and an admin resolves it once", async () => {
    const { context, client, g, bookingId } = await closedMatchSetUp();
    context.clock.set('2026-09-21T23:30:00.000Z');
    const admin = await signInAdmin(context);
    await request(context.app).post('/internal/sweep').set('Authorization', `Bearer ${TEST_INTERNAL_TOKEN}`);
    await request(context.app).post(`/ratings/bookings/${bookingId}`).set('Authorization', `Bearer ${client.token}`).send({ answer: false, stars: 1, comment: 'No vino' });

    const list = await get(context, admin.token, '/admin/cases?status=open');
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ totalItems: 1, items: [{ type: 'goalkeeper_no_show', status: 'open', bookingId, noShowIncidentId: expect.any(String) }] });
    const caseId = list.body.items[0].caseId as string;

    const detail = await get(context, admin.token, `/admin/cases/${caseId}`);
    expect(detail.body).toMatchObject({ rating: { answer: false, stars: 1, comment: 'No vino' }, checkIn: null });

    const resolve = (body: object) => request(context.app).post(`/admin/cases/${caseId}/resolve`).set('Authorization', `Bearer ${admin.token}`).send(body);
    expect((await resolve({ note: 'no' })).status).toBe(400);
    expect((await resolve({ note: 'Se habló con ambas partes' })).body).toMatchObject({ status: 'resolved', resolution: { by: admin.userId } });
    expect((await resolve({ note: 'Otra vez' })).body.error).toBe('case_already_resolved');
    expect((await get(context, g.token, '/admin/cases')).status).toBe(401);
    expect((await get(context, admin.token, '/admin/cases/missing')).status).toBe(404);
  });
});

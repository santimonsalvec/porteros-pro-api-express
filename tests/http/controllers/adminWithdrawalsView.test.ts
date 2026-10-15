import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInAdmin, signInClient, signInGoalkeeper } from '../operatingBalanceTestHelpers.js';

describe("a goalkeeper's withdrawals in the admin view (spec 005 of the admin, research §13)", () => {
  it("adds the match's city clock and the commission charged; the goalkeeper's own view does not", async () => {
    const context = await buildTestApp({ eventsMode: 'local' });
    context.clock.set(MATCH_NOW);
    const admin = await signInAdmin(context);
    const client = await signInClient(context, 'sub-1001');
    const g = await signInGoalkeeper(context, 'sub-1002');
    await context.operatingBalanceLedger.adjust(ownerOf(g.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-g' });
    const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 1 });
    const bookingId = created.bookings[0]!.bookingId;
    await request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/accept`).set('Authorization', `Bearer ${g.token}`);
    await request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/withdraw`).set('Authorization', `Bearer ${g.token}`).send({});

    const forAdmin = await request(context.app).get(`/admin/goalkeepers/${g.userId}/withdrawals`).set('Authorization', `Bearer ${admin.token}`);
    const own = await request(context.app).get('/goalkeepers/me/withdrawals').set('Authorization', `Bearer ${g.token}`);

    expect(forAdmin.status).toBe(200);
    expect(forAdmin.body.items[0]).toMatchObject({ match: { cityName: expect.any(String), timeZone: 'America/Bogota' }, commission: { amount: 7000, currency: 'COP' } });
    expect(own.body.items[0]).not.toHaveProperty('match');
    expect(own.body.items[0]).not.toHaveProperty('commission');
  });
});

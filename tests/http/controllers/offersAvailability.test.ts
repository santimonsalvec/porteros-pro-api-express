import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';
import { RunSweepCommand } from '../../../src/application/features/events/commands/runSweep/runSweepCommand.js';

const setSwitch = (context: TestApp, token: string, body: unknown) =>
  request(context.app).put('/goalkeepers/me/offers-availability').set('Authorization', `Bearer ${token}`).send(body as object);

async function setUp() {
  const context = await buildTestApp({ eventsMode: 'local' });
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-0601');
  const goalkeeper = await signInGoalkeeper(context, 'sub-0602');
  await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-0602' });
  await request(context.app).post('/devices').set('Authorization', `Bearer ${goalkeeper.token}`).send({ token: 'phone-0602', platform: 'ios' });
  return { context, client, goalkeeper };
}

describe('PUT /goalkeepers/me/offers-availability — US4: a goalkeeper turns offers on or off', () => {
  it('off: no offers, no available matches, no accepting; the profile shows it', async () => {
    const { context, client, goalkeeper } = await setUp();

    const off = await setSwitch(context, goalkeeper.token, { available: false });
    const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 1 });

    expect(off.status).toBe(200);
    expect(off.body).toEqual({ availableForOffers: false, offersSent: 0 });
    const me = await request(context.app).get('/goalkeepers/me').set('Authorization', `Bearer ${goalkeeper.token}`);
    expect(me.body.availableForOffers).toBe(false);
    expect(context.notificationRepository.all()).toHaveLength(0);
    expect(context.pushSender.calls).toHaveLength(0);
    const available = await request(context.app).get('/goalkeepers/me/available-bookings').set('Authorization', `Bearer ${goalkeeper.token}`);
    expect(available.body).toMatchObject({ items: [], unavailableReason: 'not_available_for_offers' });
    const accept = await request(context.app)
      .post(`/goalkeepers/me/bookings/${created.bookings[0]!.bookingId}/accept`)
      .set('Authorization', `Bearer ${goalkeeper.token}`);
    expect(accept.status).toBe(409);
    expect(accept.body.error).toBe('goalkeeper_not_available');
  });

  it('on: the open match arrives right away in one push, and the next round does not push again', async () => {
    const { context, client, goalkeeper } = await setUp();
    await setSwitch(context, goalkeeper.token, { available: false });
    const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 1 });

    const on = await setSwitch(context, goalkeeper.token, { available: true });

    expect(on.body).toEqual({ availableForOffers: true, offersSent: 1 });
    expect(context.pushSender.calls).toHaveLength(1);
    expect(context.pushSender.calls[0]!.message.data).toMatchObject({ type: 'booking.available', requestId: created.requestId });
    context.clock.advance(60_000);
    await context.mediator.send(new RunSweepCommand());
    expect(context.pushSender.calls).toHaveLength(1);
  });

  it('refuses a body without a boolean, and a client who is not a goalkeeper', async () => {
    const { context, client, goalkeeper } = await setUp();

    expect((await setSwitch(context, goalkeeper.token, { available: 'yes' })).status).toBe(400);
    expect((await setSwitch(context, goalkeeper.token, {})).status).toBe(400);
    expect((await setSwitch(context, client.token, { available: true })).status).toBe(404);
  });
});

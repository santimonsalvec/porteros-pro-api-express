import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

const get = (context: TestApp, token: string, path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`);
const accept = (context: TestApp, token: string, bookingId: string) =>
  request(context.app).post(`/api/goalkeepers/me/bookings/${bookingId}/accept`).set('Authorization', `Bearer ${token}`);

/** G takes the only booking of a match at `startsAtLocal` (17:00 local = 22:00Z by default). */
async function setUp(startsAtLocal = '2026-09-21T17:00:00') {
  const context = await buildTestApp();
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-1901');
  const g = await signInGoalkeeper(context, 'sub-1902');
  await context.walletLedger.adjust(ownerOf(g.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo', operationKey: 'k-g' });
  const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 1, startsAt: startsAtLocal });
  const bookingId = created.bookings[0]!.bookingId;
  return { context, client, g, bookingId, requestId: created.requestId };
}

const clientView = async (context: TestApp, token: string) => (await get(context, token, '/api/goalkeeper-requests/bookings')).body.items[0];
const agendaItem = async (context: TestApp, token: string) => (await get(context, token, '/api/goalkeepers/me/bookings')).body.items[0];

describe('contact visibility — US3: both sides see each other only in the last hour', () => {
  it('hides both contacts until start − 60 min, and shows them from then on', async () => {
    const { context, client, g, bookingId } = await setUp();
    const accepted = await accept(context, g.token, bookingId);
    expect(accepted.body).toMatchObject({ client: null, clientContactVisibleFrom: '2026-09-21T21:00:00.000Z' });

    const before = await clientView(context, client.token);
    expect(before).toMatchObject({ contactsVisibleFrom: '2026-09-21T21:00:00.000Z', bookings: [{ status: 'assigned', goalkeeper: null }] });
    expect(await agendaItem(context, g.token)).toMatchObject({ client: null, clientContactVisibleFrom: '2026-09-21T21:00:00.000Z' });

    context.clock.set('2026-09-21T21:00:00.000Z');
    expect((await clientView(context, client.token)).bookings[0].goalkeeper).toMatchObject({ firstName: expect.any(String), whatsApp: expect.stringMatching(/^\+57 /) });
    expect((await agendaItem(context, g.token)).client).toMatchObject({ firstName: expect.any(String), whatsApp: expect.stringMatching(/^\+57 /) });
  });

  it('never shows the client to a goalkeeper who withdrew, even in the last hour', async () => {
    const { context, g, bookingId } = await setUp();
    await accept(context, g.token, bookingId);
    await request(context.app).post(`/api/goalkeepers/me/bookings/${bookingId}/withdraw`).set('Authorization', `Bearer ${g.token}`).send({});
    context.clock.set('2026-09-21T21:30:00.000Z');

    const item = (await get(context, g.token, '/api/goalkeepers/me/bookings')).body.items.find((entry: { bookingId: string }) => entry.bookingId === bookingId);
    expect(item).toMatchObject({ status: 'goalkeeper_withdrew', client: null });
  });

  it('shows the client right away when the booking is taken in the last hour', async () => {
    const { context, g, bookingId } = await setUp('2026-09-21T15:00:00'); // 20:00Z: visible from 19:00Z
    context.clock.set('2026-09-21T19:10:00.000Z');

    const accepted = await accept(context, g.token, bookingId);

    expect(accepted.status).toBe(201);
    expect(accepted.body.client).toMatchObject({ firstName: expect.any(String), whatsApp: expect.stringMatching(/^\+57 /) });
  });
});

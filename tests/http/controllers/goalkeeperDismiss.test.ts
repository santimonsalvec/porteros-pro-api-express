import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

const dismiss = (context: TestApp, token: string, bookingId: string) =>
  request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/dismiss`).set('Authorization', `Bearer ${token}`);
const accept = (context: TestApp, token: string, bookingId: string) =>
  request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/accept`).set('Authorization', `Bearer ${token}`);
const availableIds = async (context: TestApp, token: string) =>
  (await request(context.app).get('/goalkeepers/me/available-bookings').set('Authorization', `Bearer ${token}`)).body.items.map(
    (item: { bookingId: string }) => item.bookingId,
  ) as string[];

/** A 2-goalkeeper Cali Norte request at 17:00 and two funded goalkeepers, G and H. */
async function setUp() {
  const context = await buildTestApp({ eventsMode: 'local' });
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-2401');
  const g = await signInGoalkeeper(context, 'sub-2402');
  const h = await signInGoalkeeper(context, 'sub-2403');
  for (const [goalkeeper, key] of [[g, 'k-g'], [h, 'k-h']] as const) {
    await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: key });
  }
  const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 2, startsAt: '2026-09-21T17:00:00' });
  const [first, second] = created.bookings.map((booking) => booking.bookingId) as [string, string];
  return { context, client, g, h, first, second };
}

describe('POST /goalkeepers/me/bookings/{id}/dismiss — feature 024 "No me interesa"', () => {
  it('hides both places of the request from that goalkeeper only, and refuses to let them accept it', async () => {
    const { context, g, h, first, second } = await setUp();
    expect(await availableIds(context, g.token)).toEqual(expect.arrayContaining([first, second]));

    const response = await dismiss(context, g.token, first);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ dismissed: true });
    expect(await availableIds(context, g.token)).not.toEqual(expect.arrayContaining([first]));
    expect(await availableIds(context, g.token)).not.toContain(second);
    expect(await availableIds(context, h.token)).toEqual(expect.arrayContaining([first, second]));
    expect((await accept(context, g.token, second)).body.error).toBe('booking_not_available');
  });

  it('is idempotent', async () => {
    const { context, g, first } = await setUp();

    expect((await dismiss(context, g.token, first)).status).toBe(200);
    expect((await dismiss(context, g.token, first)).status).toBe(200);
  });

  it('answers 404 for an unknown booking', async () => {
    const { context, g } = await setUp();

    const response = await dismiss(context, g.token, '01890000-0000-7000-8000-000000000000');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('booking_not_found');
  });

  it('answers 409 when the goalkeeper already holds a place of that request', async () => {
    const { context, g, first, second } = await setUp();
    expect((await accept(context, g.token, first)).status).toBe(201);

    const response = await dismiss(context, g.token, second);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('booking_held');
  });

  it('refuses a caller who is not a goalkeeper', async () => {
    const { context, client, first } = await setUp();

    expect((await dismiss(context, client.token, first)).status).toBeGreaterThanOrEqual(400);
  });
});

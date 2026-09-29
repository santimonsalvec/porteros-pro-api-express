import request from 'supertest';
import { expect } from 'vitest';
import { buildTestApp } from './testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper } from './walletTestHelpers.js';

/** G holds the only booking of a 22:00Z–23:30Z match. */
export async function closedMatchSetUp() {
  const context = await buildTestApp({ eventsMode: 'local' });
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-2101');
  const g = await signInGoalkeeper(context, 'sub-2102');
  await context.walletLedger.adjust(ownerOf(g.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo', operationKey: 'k-g' });
  const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 1, startsAt: '2026-09-21T17:00:00' });
  const bookingId = created.bookings[0]!.bookingId;
  expect((await request(context.app).post(`/api/goalkeepers/me/bookings/${bookingId}/accept`).set('Authorization', `Bearer ${g.token}`)).status).toBe(201);
  return { context, client, g, bookingId, requestId: created.requestId };
}

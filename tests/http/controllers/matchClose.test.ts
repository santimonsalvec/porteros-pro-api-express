import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { TEST_INTERNAL_TOKEN } from '../testAppFactory.js';
import type { TestApp } from '../walletTestHelpers.js';
import { closedMatchSetUp } from '../closeHelpers.js';

const get = (context: TestApp, token: string, path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`);
const sweep = (context: TestApp) => request(context.app).post('/internal/sweep').set('Authorization', `Bearer ${TEST_INTERNAL_TOKEN}`);

describe('match close — US1 (feature 021)', () => {
  it('completes the booking and the request at the end of the match', async () => {
    const { context, client, g } = await closedMatchSetUp();
    context.clock.set('2026-09-21T23:30:00.000Z');

    expect((await sweep(context)).status).toBe(200);

    const requests = await get(context, client.token, '/api/goalkeeper-requests/bookings');
    expect(requests.body.items[0]).toMatchObject({ status: 'completed', bookings: [{ status: 'completed' }] });
    const agenda = await get(context, g.token, '/api/goalkeepers/me/bookings');
    expect(agenda.body.items[0].status).toBe('completed');
  });
});

describe('no-shows — US3 (feature 021)', () => {
  it('suspends the goalkeeper and tells them when nobody confirmed attendance', async () => {
    const { context, g } = await closedMatchSetUp();
    context.clock.set('2026-09-21T23:30:00.000Z');
    await sweep(context);
    context.clock.set('2026-09-22T00:30:00.000Z');
    await sweep(context);

    expect((await get(context, g.token, '/api/goalkeepers/me/available-bookings')).body.unavailableReason).toBe('suspended');
    expect(context.notificationRepository.all().filter((item) => item.userId === g.userId && item.type === 'goalkeeper.no_show')).toHaveLength(1);
    const history = await get(context, g.token, '/api/goalkeepers/me/withdrawals');
    expect(history.body.items).toMatchObject([{ kind: 'no_show', late: true }]);
  });
});

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { signInAdmin } from '../walletTestHelpers.js';

const pushBody = {
  message: {
    data: Buffer.from(
      JSON.stringify({
        id: 'ev-1',
        type: 'booking.created',
        version: 1,
        occurredAt: '2026-09-28T18:00:00.000Z',
        bookingId: 'b-1',
        requestId: 'r-1',
        payload: { clientId: 'c', zoneId: 'z', startsAt: '2026-09-29T20:00:00.000Z', commission: 7000, currency: 'COP', goalkeeperCount: 1 },
      }),
    ).toString('base64'),
  },
};

describe('/internal/* — US5: only the platform can trigger the sweep and deliver events', () => {
  it.each(['/internal/events', '/internal/sweep'])('%s refuses no token, an admin app token and a wrong token, and runs nothing', async (path) => {
    const context = await buildTestApp();
    const admin = await signInAdmin(context);

    const responses = [
      await request(context.app).post(path).send(pushBody),
      await request(context.app).post(path).set('Authorization', `Bearer ${admin.token}`).send(pushBody),
      await request(context.app).post(path).set('Authorization', 'Bearer forged').send(pushBody),
    ];

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401]);
    expect(responses[0]!.body.error).toBe('unauthenticated');
    expect(context.eventDeliveryLog.all()).toHaveLength(0);
    expect(context.eventPublisher.published()).toHaveLength(0);
  });

  it('keeps /internal out of the public API document', async () => {
    const context = await buildTestApp();

    const spec = await request(context.app).get('/openapi.json');

    expect(Object.keys(spec.body.paths).filter((path) => path.startsWith('/internal'))).toEqual([]);
  });
});

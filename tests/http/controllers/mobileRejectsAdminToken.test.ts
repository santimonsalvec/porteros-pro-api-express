import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { signInStaff } from '../adminTestHelpers.js';

/** Every kind of app route, including those that only ask for a signed-in user. */
const APP_ROUTES: ['get' | 'post', string][] = [
  ['get', '/auth/me'],
  ['get', '/clients/me'],
  ['get', '/zones?cityId=city-cali'],
  ['get', '/locations/cities?countryCode=CO'],
  ['get', '/notifications'],
  ['post', '/devices'],
  ['post', '/profile/complete'],
  ['get', '/goalkeepers/me'],
  ['get', '/goalkeeper-requests/bookings'],
  ['get', '/ratings/pending'],
];

describe("an admin web token never works on the app's routes (spec 001, US2)", () => {
  it.each(APP_ROUTES)('%s %s → 401', async (method, path) => {
    const context = await buildTestApp();
    const owner = await signInStaff(context, { key: 'dueno' });

    const pending = request(context.app)[method](path).set('Authorization', `Bearer ${owner.token}`);
    const response = method === 'post' ? await pending.send({}) : await pending;

    expect(response.status).toBe(401);
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';

const tinyJpeg = readFileSync(fileURLToPath(new URL('../../fixtures/tinyImage.jpg', import.meta.url)));

type TestApp = ReturnType<typeof buildTestApp>;

async function signInAndComplete(ctx: TestApp, sub: string): Promise<string> {
  ctx.googleValidator.registerValidCredential(`cred-${sub}`, new ExternalIdentity('google', sub, `${sub}@example.com`));
  const exchange = await request(ctx.app)
    .post('/api/auth/sso/exchange')
    .send({ provider: 'google', platform: 'mobile', credential: `cred-${sub}` });
  const completion = await request(ctx.app)
    .post('/api/profile/complete')
    .set('Authorization', `Bearer ${exchange.body.accessToken}`)
    .send({ firstName: 'Old', lastName: 'Name', countryCode: 'CO', whatsAppNumber: '300 000 0000', acceptedTerms: true });
  return completion.body.accessToken as string;
}

async function fillDraft(ctx: TestApp, token: string, documentNumber: string): Promise<void> {
  const auth = { Authorization: `Bearer ${token}` };
  await request(ctx.app)
    .patch('/api/goalkeepers/me/identification')
    .set(auth)
    .send({ documentType: 'cedula_ciudadania', documentNumber, issueDate: '2013-07-02', birthDate: '1995-03-14' });
  await request(ctx.app).patch('/api/goalkeepers/me/physical-data').set(auth).send({ heightCm: 185, weightKg: 78 });
  await request(ctx.app).patch('/api/goalkeepers/me/availability').set(auth).send({ cityId: 'city-medellin', zoneIds: ['zone-bello'] });
  await request(ctx.app)
    .post('/api/goalkeepers/me/document-photo')
    .set(auth)
    .attach('sideA', tinyJpeg, 'front.jpg')
    .attach('sideB', tinyJpeg, 'back.jpg');
}

/** A signed-in client whose goalkeeper profile is ACTIVE; the returned token is refreshed, i.e. carries `isGoalkeeper`. */
async function activeGoalkeeper(ctx: TestApp, sub: string): Promise<string> {
  const token = await signInAndComplete(ctx, sub);
  await fillDraft(ctx, token, `doc-${sub}`);
  const activation = await request(ctx.app).post('/api/goalkeepers/me/activate').set('Authorization', `Bearer ${token}`);
  expect(activation.status).toBe(200);
  return token;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('PATCH /api/goalkeepers/me/profile/physical-data (active goalkeeper)', () => {
  it('updates only the height when only the height is sent, and GET /me reflects it', async () => {
    const ctx = buildTestApp();
    const token = await activeGoalkeeper(ctx, 'a1');

    const response = await request(ctx.app).patch('/api/goalkeepers/me/profile/physical-data').set(bearer(token)).send({ heightCm: 190 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'active', heightCm: 190, weightKg: 78 });
    const view = await request(ctx.app).get('/api/goalkeepers/me').set(bearer(token));
    expect(view.body).toMatchObject({ status: 'active', heightCm: 190, weightKg: 78 });
  });

  it('updates only the weight when only the weight is sent', async () => {
    const ctx = buildTestApp();
    const token = await activeGoalkeeper(ctx, 'a2');

    const response = await request(ctx.app).patch('/api/goalkeepers/me/profile/physical-data').set(bearer(token)).send({ weightKg: 82 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ heightCm: 185, weightKg: 82 });
  });

  it('is idempotent: repeating the same request gives the same 200 and state', async () => {
    const ctx = buildTestApp();
    const token = await activeGoalkeeper(ctx, 'a3');
    const send = () => request(ctx.app).patch('/api/goalkeepers/me/profile/physical-data').set(bearer(token)).send({ heightCm: 192, weightKg: 80 });

    const first = await send();
    const second = await send();

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.body).toMatchObject({ heightCm: 192, weightKg: 80 });
  });

  it('keeps the goalkeeper active — no status change, no reactivation needed', async () => {
    const ctx = buildTestApp();
    const token = await activeGoalkeeper(ctx, 'a4');

    await request(ctx.app).patch('/api/goalkeepers/me/profile/physical-data').set(bearer(token)).send({ heightCm: 190 });

    const view = await request(ctx.app).get('/api/goalkeepers/me').set(bearer(token));
    expect(view.body.status).toBe('active');
    const reactivation = await request(ctx.app).post('/api/goalkeepers/me/activate').set(bearer(token));
    expect(reactivation.body.error).toBe('already_active');
  });

  it.each([
    ['height 119', { heightCm: 119 }, 'heightCm'],
    ['height 231', { heightCm: 231 }, 'heightCm'],
    ['weight 39', { weightKg: 39 }, 'weightKg'],
    ['weight 151', { weightKg: 151 }, 'weightKg'],
  ])('rejects %s with 400 validation_failed and a field error, changing nothing', async (_label, body, field) => {
    const ctx = buildTestApp();
    const token = await activeGoalkeeper(ctx, `v-${field}-${JSON.stringify(body)}`);

    const response = await request(ctx.app).patch('/api/goalkeepers/me/profile/physical-data').set(bearer(token)).send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_failed');
    expect(Object.keys(response.body.fieldErrors)).toEqual([field]);
    const view = await request(ctx.app).get('/api/goalkeepers/me').set(bearer(token));
    expect([view.body.heightCm, view.body.weightKg]).toEqual([185, 78]);
  });

  it('rejects an empty body and non-numeric values with 400 validation_failed', async () => {
    const ctx = buildTestApp();
    const token = await activeGoalkeeper(ctx, 'a5');
    const patch = (body: object) => request(ctx.app).patch('/api/goalkeepers/me/profile/physical-data').set(bearer(token)).send(body);

    for (const body of [{}, { heightCm: 'tall' }, { weightKg: null }]) {
      const response = await patch(body);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('validation_failed');
    }
  });

  it('returns 404 goalkeeper_not_found for a client who never started a registration', async () => {
    const ctx = buildTestApp();
    const token = await signInAndComplete(ctx, 'n1');

    const response = await request(ctx.app).patch('/api/goalkeepers/me/profile/physical-data').set(bearer(token)).send({ heightCm: 190 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('goalkeeper_not_found');
  });

  it('returns 409 goalkeeper_not_active for a draft registration, and leaves the draft untouched', async () => {
    const ctx = buildTestApp();
    const token = await signInAndComplete(ctx, 'd1');
    await request(ctx.app).patch('/api/goalkeepers/me/physical-data').set(bearer(token)).send({ heightCm: 170, weightKg: 60 });

    const response = await request(ctx.app).patch('/api/goalkeepers/me/profile/physical-data').set(bearer(token)).send({ heightCm: 190 });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('goalkeeper_not_active');
    const view = await request(ctx.app).get('/api/goalkeepers/me').set(bearer(token));
    expect(view.body).toMatchObject({ status: 'in_progress', heightCm: 170 });
  });

  it('authorizes against the database, not the token claim: a token claiming isGoalkeeper is still refused without a profile', async () => {
    const ctx = buildTestApp();
    const token = await signInAndComplete(ctx, 'claim1');
    const forged = 'forged-goalkeeper-token';
    // A (hypothetically stale or tampered-with) token that claims isGoalkeeper for an account that has no profile.
    const claims = await ctx.tokenIssuer.verifyAccessToken(token);
    ctx.tokenIssuer.registerAccessToken(forged, { ...claims!, isGoalkeeper: 'true' });

    const response = await request(ctx.app).patch('/api/goalkeepers/me/profile/physical-data').set(bearer(forged)).send({ heightCm: 190 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('goalkeeper_not_found');
  });

  it('succeeds for an active goalkeeper whose token is stale and lacks the isGoalkeeper claim', async () => {
    const ctx = buildTestApp();
    const token = await activeGoalkeeper(ctx, 'stale1'); // this token was issued before activation
    expect((await ctx.tokenIssuer.verifyAccessToken(token))?.isGoalkeeper).toBeUndefined();

    const response = await request(ctx.app).patch('/api/goalkeepers/me/profile/physical-data').set(bearer(token)).send({ heightCm: 190 });

    expect(response.status).toBe(200);
  });

  it('returns 401 without a token', async () => {
    const { app } = buildTestApp();

    const response = await request(app).patch('/api/goalkeepers/me/profile/physical-data').send({ heightCm: 190 });

    expect(response.status).toBe(401);
  });
});

describe('PUT /api/goalkeepers/me/profile/availability (active goalkeeper)', () => {
  it('replaces city and zones together, and GET /me reflects the new city with its name and region', async () => {
    const ctx = buildTestApp();
    const token = await activeGoalkeeper(ctx, 'l1');

    const response = await request(ctx.app)
      .put('/api/goalkeepers/me/profile/availability')
      .set(bearer(token))
      .send({ cityId: 'city-envigado', zoneIds: ['zone-bello', 'zone-copacabana'] });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'active', cityId: 'city-envigado', serviceZoneIds: ['zone-bello', 'zone-copacabana'] });
    const view = await request(ctx.app).get('/api/goalkeepers/me').set(bearer(token));
    expect(view.body.cityId).toBe('city-envigado');
    expect(view.body.serviceZoneIds).toEqual(['zone-bello', 'zone-copacabana']);
    expect(view.body.city).toEqual({ id: 'city-envigado', name: 'Envigado', region: 'Antioquia' });
    expect([view.body.heightCm, view.body.weightKg]).toEqual([185, 78]);
  });

  it('is idempotent', async () => {
    const ctx = buildTestApp();
    const token = await activeGoalkeeper(ctx, 'l2');
    const send = () =>
      request(ctx.app).put('/api/goalkeepers/me/profile/availability').set(bearer(token)).send({ cityId: 'city-medellin', zoneIds: ['zone-copacabana'] });

    const first = await send();
    const second = await send();

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.body.serviceZoneIds).toEqual(['zone-copacabana']);
  });

  it('rejects an unknown city with 400 invalid_city and changes nothing', async () => {
    const ctx = buildTestApp();
    const token = await activeGoalkeeper(ctx, 'l3');

    const response = await request(ctx.app)
      .put('/api/goalkeepers/me/profile/availability')
      .set(bearer(token))
      .send({ cityId: 'city-nowhere', zoneIds: ['zone-bello'] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_city');
    const view = await request(ctx.app).get('/api/goalkeepers/me').set(bearer(token));
    expect(view.body.cityId).toBe('city-medellin');
  });

  it('rejects invalid zones with 400 invalid_zones naming them, and changes nothing', async () => {
    const ctx = buildTestApp();
    const token = await activeGoalkeeper(ctx, 'l4');

    const response = await request(ctx.app)
      .put('/api/goalkeepers/me/profile/availability')
      .set(bearer(token))
      .send({ cityId: 'city-medellin', zoneIds: ['zone-bello', 'zone-missing'] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_zones');
    expect(response.body.invalidZoneIds).toEqual(['zone-missing']);
    const view = await request(ctx.app).get('/api/goalkeepers/me').set(bearer(token));
    expect(view.body.serviceZoneIds).toEqual(['zone-bello']);
  });

  it('rejects a body with no zones, a blank city, or a missing field with 400 validation_failed', async () => {
    const ctx = buildTestApp();
    const token = await activeGoalkeeper(ctx, 'l5');
    const put = (body: object) => request(ctx.app).put('/api/goalkeepers/me/profile/availability').set(bearer(token)).send(body);

    for (const body of [{ cityId: 'city-medellin', zoneIds: [] }, { cityId: ' ', zoneIds: ['zone-bello'] }, { cityId: 'city-medellin' }, {}]) {
      const response = await put(body);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('validation_failed');
    }
  });

  it('returns 404 goalkeeper_not_found for a client who never started a registration', async () => {
    const ctx = buildTestApp();
    const token = await signInAndComplete(ctx, 'ln1');

    const response = await request(ctx.app)
      .put('/api/goalkeepers/me/profile/availability')
      .set(bearer(token))
      .send({ cityId: 'city-medellin', zoneIds: ['zone-bello'] });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('goalkeeper_not_found');
  });

  it('returns 409 goalkeeper_not_active for a draft registration', async () => {
    const ctx = buildTestApp();
    const token = await signInAndComplete(ctx, 'ld1');
    await request(ctx.app).patch('/api/goalkeepers/me/physical-data').set(bearer(token)).send({ heightCm: 170, weightKg: 60 });

    const response = await request(ctx.app)
      .put('/api/goalkeepers/me/profile/availability')
      .set(bearer(token))
      .send({ cityId: 'city-medellin', zoneIds: ['zone-bello'] });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('goalkeeper_not_active');
  });
});

describe('parallel autosave of physical data and availability', () => {
  it('keeps both edits when they arrive at the same time', async () => {
    const ctx = buildTestApp();
    const token = await activeGoalkeeper(ctx, 'p1');

    const [physical, availability] = await Promise.all([
      request(ctx.app).patch('/api/goalkeepers/me/profile/physical-data').set(bearer(token)).send({ heightCm: 195, weightKg: 85 }),
      request(ctx.app)
        .put('/api/goalkeepers/me/profile/availability')
        .set(bearer(token))
        .send({ cityId: 'city-envigado', zoneIds: ['zone-copacabana'] }),
    ]);

    expect([physical.status, availability.status]).toEqual([200, 200]);
    const view = await request(ctx.app).get('/api/goalkeepers/me').set(bearer(token));
    expect(view.body).toMatchObject({ heightCm: 195, weightKg: 85, cityId: 'city-envigado', serviceZoneIds: ['zone-copacabana'] });
  });

  it('is last-write-wins for repeated edits of the same field', async () => {
    const ctx = buildTestApp();
    const token = await activeGoalkeeper(ctx, 'p2');

    await request(ctx.app).patch('/api/goalkeepers/me/profile/physical-data').set(bearer(token)).send({ heightCm: 190 });
    await request(ctx.app).patch('/api/goalkeepers/me/profile/physical-data').set(bearer(token)).send({ heightCm: 191 });

    const view = await request(ctx.app).get('/api/goalkeepers/me').set(bearer(token));
    expect(view.body.heightCm).toBe(191);
  });
});

describe('the draft registration flow is unchanged', () => {
  it('still saves physical data and availability sections of a not-yet-active registration', async () => {
    const ctx = buildTestApp();
    const token = await signInAndComplete(ctx, 'draft1');

    const physical = await request(ctx.app).patch('/api/goalkeepers/me/physical-data').set(bearer(token)).send({ heightCm: 185, weightKg: 78 });
    const availability = await request(ctx.app)
      .patch('/api/goalkeepers/me/availability')
      .set(bearer(token))
      .send({ cityId: 'city-medellin', zoneIds: ['zone-bello'] });

    expect(physical.status).toBe(200);
    expect(physical.body).toMatchObject({ status: 'in_progress', heightCm: 185, weightKg: 78 });
    expect(availability.status).toBe(200);
    expect(availability.body).toMatchObject({ status: 'in_progress', cityId: 'city-medellin', serviceZoneIds: ['zone-bello'] });
    expect(availability.body).not.toHaveProperty('city');
  });

  it('keeps the old draft routes locked with 409 already_active once the goalkeeper is active', async () => {
    const ctx = buildTestApp();
    const token = await activeGoalkeeper(ctx, 'draft2');

    const physical = await request(ctx.app).patch('/api/goalkeepers/me/physical-data').set(bearer(token)).send({ heightCm: 190 });
    const availability = await request(ctx.app)
      .patch('/api/goalkeepers/me/availability')
      .set(bearer(token))
      .send({ cityId: 'city-medellin', zoneIds: ['zone-bello'] });
    const identification = await request(ctx.app).patch('/api/goalkeepers/me/identification').set(bearer(token)).send({ documentNumber: 'changed' });

    for (const response of [physical, availability, identification]) {
      expect(response.status).toBe(409);
      expect(response.body.error).toBe('already_active');
    }
  });

  it('keeps activation errors: incomplete → 409 goalkeeper_profile_incomplete with missingSections', async () => {
    const ctx = buildTestApp();
    const token = await signInAndComplete(ctx, 'draft3');
    await request(ctx.app).patch('/api/goalkeepers/me/physical-data').set(bearer(token)).send({ heightCm: 185, weightKg: 78 });

    const response = await request(ctx.app).post('/api/goalkeepers/me/activate').set(bearer(token));

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('goalkeeper_profile_incomplete');
    expect(response.body.missingSections).toEqual(['identification', 'availability']);
  });

  it('GET /me on a draft returns the city name and region once a city is saved, and city: null before', async () => {
    const ctx = buildTestApp();
    const token = await signInAndComplete(ctx, 'draft4');

    const before = await request(ctx.app).get('/api/goalkeepers/me').set(bearer(token));
    await request(ctx.app).patch('/api/goalkeepers/me/availability').set(bearer(token)).send({ cityId: 'city-medellin', zoneIds: ['zone-bello'] });
    const after = await request(ctx.app).get('/api/goalkeepers/me').set(bearer(token));

    expect(before.body.city).toBeNull();
    expect(after.body.city).toEqual({ id: 'city-medellin', name: 'Medellín', region: 'Antioquia' });
    expect(after.body.status).toBe('in_progress');
  });
});

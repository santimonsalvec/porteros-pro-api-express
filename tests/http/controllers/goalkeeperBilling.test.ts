import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';
import { buildTestApp } from '../testAppFactory.js';
import { signInGoalkeeper } from '../operatingBalanceTestHelpers.js';

type Context = Awaited<ReturnType<typeof buildTestApp>>;

async function signInClient(context: Context, sub: string): Promise<string> {
  context.googleValidator.registerValidCredential(`cred-${sub}`, new ExternalIdentity('google', sub, `${sub}@example.com`));
  const exchange = await request(context.app).post('/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential: `cred-${sub}` });
  const completion = await request(context.app)
    .post('/profile/complete')
    .set('Authorization', `Bearer ${exchange.body.accessToken}`)
    .send({ firstName: 'Ana', lastName: 'Portera', countryCode: 'CO', whatsAppNumber: `300 111 ${sub.slice(-4)}`, acceptedTerms: true });
  return completion.body.accessToken as string;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('PATCH /goalkeepers/me/billing (spec 031, A6)', () => {
  it('saves the draft billing data field by field, and GET /me names the municipality and its department', async () => {
    const context = await buildTestApp();
    const token = await signInClient(context, 'sub-3201');

    const city = await request(context.app).patch('/goalkeepers/me/billing').set(bearer(token)).send({ cityId: 'city-medellin' });
    const address = await request(context.app).patch('/goalkeepers/me/billing').set(bearer(token)).send({ address: 'Calle 10 # 20-30', addressComplement: 'Apto 301' });
    const me = await request(context.app).get('/goalkeepers/me').set(bearer(token));

    expect([city.status, city.body.sections.billing]).toEqual([200, { complete: false }]);
    expect([address.status, address.body.sections.billing]).toEqual([200, { complete: true }]);
    expect(me.body.billing).toEqual({ cityId: 'city-medellin', cityName: 'Medellín', stateName: 'Antioquia', address: 'Calle 10 # 20-30', addressComplement: 'Apto 301' });
  });

  it('refuses an unknown municipality, a short address and unknown fields', async () => {
    const context = await buildTestApp();
    const token = await signInClient(context, 'sub-3202');

    const unknown = await request(context.app).patch('/goalkeepers/me/billing').set(bearer(token)).send({ cityId: 'nope' });
    const short = await request(context.app).patch('/goalkeepers/me/billing').set(bearer(token)).send({ address: 'Cl 1' });
    const extra = await request(context.app).patch('/goalkeepers/me/billing').set(bearer(token)).send({ marketId: 'city-medellin' });

    expect([unknown.status, unknown.body.error]).toEqual([400, 'invalid_city']);
    expect([short.status, short.body.fieldErrors]).toEqual([400, { address: 'invalid_length' }]);
    expect(extra.status).toBe(400);
  });
});

describe('PUT /goalkeepers/me/profile/billing (spec 031, A7)', () => {
  it("replaces an active goalkeeper's billing data", async () => {
    const context = await buildTestApp();
    const goalkeeper = await signInGoalkeeper(context, 'sub-3203');

    const saved = await request(context.app)
      .put('/goalkeepers/me/profile/billing')
      .set(bearer(goalkeeper.token))
      .send({ cityId: 'city-bogota', address: 'Carrera 7 # 72-10', addressComplement: null });
    const me = await request(context.app).get('/goalkeepers/me').set(bearer(goalkeeper.token));

    expect([saved.status, saved.body.billing]).toEqual([200, { cityId: 'city-bogota', address: 'Carrera 7 # 72-10', addressComplement: null }]);
    expect(me.body.billing).toMatchObject({ cityName: 'Bogotá', address: 'Carrera 7 # 72-10' });
  });

  it('refuses someone who is not an active goalkeeper', async () => {
    const context = await buildTestApp();
    const token = await signInClient(context, 'sub-3204');

    const response = await request(context.app).put('/goalkeepers/me/profile/billing').set(bearer(token)).send({ cityId: 'city-bogota', address: 'Carrera 7 # 72-10' });

    expect([response.status, response.body.error]).toEqual([404, 'goalkeeper_not_found']);
  });
});

describe('GET /locations/cities?q= (spec 031, A3)', () => {
  it('searches the municipalities with official codes, and answers nothing without a query', async () => {
    const context = await buildTestApp();
    const token = await signInClient(context, 'sub-3205');

    const found = await request(context.app).get('/locations/cities?q=Mede').set(bearer(token));
    const empty = await request(context.app).get('/locations/cities').set(bearer(token));

    expect(found.body.cities).toEqual([{ id: 'city-medellin', name: 'Medellín', stateName: 'Antioquia' }]);
    expect(empty.body.cities).toEqual([]);
  });
});

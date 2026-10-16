import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { createRequestAsClient, MATCH_NOW, signInClient, signInGoalkeeper, type TestApp } from '../operatingBalanceTestHelpers.js';
import { buildGoalkeeperProfile } from '../../fixtures/operatingBalanceFixtures.js';

const get = (context: TestApp, token: string, path: string, scope?: string) => {
  const pending = request(context.app).get(path).set('Authorization', `Bearer ${token}`);
  return scope === undefined ? pending : pending.set('X-Scope', scope);
};

async function world() {
  const context = await buildTestApp();
  context.clock.set(MATCH_NOW);
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  return { context, owner };
}

describe('X-Scope on market-level sections (spec 031, contract B1)', () => {
  it('filters the requests by the selected market or country, and naming the market of each row', async () => {
    const { context, owner } = await world();
    const client = await signInClient(context, 'sub-3401');
    await createRequestAsClient(context, client.token, { goalkeeperCount: 1, startsAt: '2026-09-21T17:00:00' });

    const cali = await get(context, owner.token, '/admin/requests', 'market:city-cali');
    const medellin = await get(context, owner.token, '/admin/requests', 'market:city-medellin');
    const colombia = await get(context, owner.token, '/admin/requests', 'country:country-co');
    const mexico = await get(context, owner.token, '/admin/requests', 'country:country-mx');

    expect(cali.body.items).toHaveLength(1);
    expect(cali.body.items[0].match.market).toEqual({ id: 'city-cali', name: 'Cali' });
    expect(medellin.body.items).toEqual([]);
    expect(colombia.body.items).toHaveLength(1);
    expect(mexico.body.items).toEqual([]);
    expect((await get(context, owner.token, '/admin/requests?countryId=country-co')).status).toBe(400);
  });

  it('answers a malformed, unknown or missing scope with its code', async () => {
    const { context, owner } = await world();

    expect((await get(context, owner.token, '/admin/cases', 'city:city-cali')).body.error).toBe('invalid_scope');
    expect((await get(context, owner.token, '/admin/cases', 'market:nope')).status).toBe(404);
    expect((await get(context, owner.token, '/admin/cases')).status).toBe(200);
  });
});

describe('X-Scope on country-level sections', () => {
  it('lists the goalkeepers of the selected country, a selected market standing for its country, with the optional ?marketId=', async () => {
    const { context, owner } = await world();
    await signInGoalkeeper(context, 'sub-3402');
    const medellin = await signInClient(context, 'sub-3403');
    context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(medellin.userId, { marketId: 'city-medellin', zoneIds: ['zone-bello'] }));

    const colombia = await get(context, owner.token, '/admin/goalkeepers', 'country:country-co');
    const fromMarket = await get(context, owner.token, '/admin/goalkeepers', 'market:city-cali');
    const narrowed = await get(context, owner.token, '/admin/goalkeepers?marketId=city-medellin', 'country:country-co');
    const mexico = await get(context, owner.token, '/admin/goalkeepers', 'country:country-mx');

    expect(colombia.body.totalItems).toBe(2);
    expect(fromMarket.body.totalItems).toBe(2);
    expect(narrowed.body.items.map((item: { userId: string }) => item.userId)).toEqual([medellin.userId]);
    expect(mexico.body.totalItems).toBe(0);
  });

  it('lists the operating balances of the selected country only', async () => {
    const { context, owner } = await world();
    const g = await signInGoalkeeper(context, 'sub-3404');
    await context.operatingBalanceLedger.adjust(
      { goalkeeperId: g.userId, currency: 'COP', invoicing: { documentType: 'CC', documentNumber: '1'}, marketId: 'city-cali'  },
      { adminUserId: 'admin-1', amount: 1000, reason: 'Saldo', operationKey: 'k-1' },
    );

    const colombia = await get(context, owner.token, '/admin/operating-balances', 'country:country-co');
    const mexico = await get(context, owner.token, '/admin/operating-balances', 'country:country-mx');

    expect(colombia.body.items.map((item: { goalkeeper: { userId: string } }) => item.goalkeeper.userId)).toContain(g.userId);
    expect(mexico.body.items).toEqual([]);
  });
});

describe('platform sections and the picker', () => {
  it('ignores X-Scope on platform routes', async () => {
    const { context, owner } = await world();
    expect((await get(context, owner.token, '/admin/staff', 'nonsense')).status).toBe(200);
  });

  it("lists the member's countries with their markets for the picker", async () => {
    const { context, owner } = await world();

    const scopes = await get(context, owner.token, '/admin/me/scopes', 'nonsense');

    expect(scopes.status).toBe(200);
    expect(scopes.body.platform).toBe(true);
    const colombia = scopes.body.countries.find((country: { id: string }) => country.id === 'country-co');
    expect(colombia).toMatchObject({ name: 'Colombia', currency: 'COP', full: true });
    expect(colombia.markets).toContainEqual({ id: 'city-cali', name: 'Cali', status: 'enabled' });
  });

  it('records the selection in each audited write', async () => {
    const { context, owner } = await world();

    await request(context.app)
      .patch('/admin/markets/city-cali')
      .set('Authorization', `Bearer ${owner.token}`)
      .set('X-Scope', 'market:city-cali')
      .send({ revision: 0, name: 'Cali' });

    const entry = context.adminAuditLog.entries.find((item) => item.action === 'market.update');
    expect(entry?.scope).toEqual({ countryId: 'country-co', marketId: 'city-cali' });
  });
});

describe('a member who holds only Medellín (spec 031, US8)', () => {
  async function medellinOperator(context: TestApp) {
    await seedRole(context, 'operador', ['requests.read', 'goalkeepers.read', 'markets.read', 'markets.manage', 'markets.lifecycle', 'operating_balances.read']);
    return signInStaff(context, { key: 'operador-med', roleId: 'operador', scopes: [{ kind: 'market', id: 'city-medellin' }] });
  }

  it('sees only its market in the picker, and is refused another market', async () => {
    const { context } = await world();
    const operator = await medellinOperator(context);

    const scopes = await get(context, operator.token, '/admin/me/scopes');
    const other = await get(context, operator.token, '/admin/requests', 'market:city-cali');

    expect(scopes.body.platform).toBe(false);
    expect(scopes.body.countries).toEqual([
      { id: 'country-co', name: 'Colombia', currency: 'COP', full: false, markets: [{ id: 'city-medellin', name: 'Medellín', status: 'enabled' }] },
    ]);
    expect([other.status, other.body.error]).toEqual([403, 'scope_denied']);
    expect(context.adminAuditLog.entries).toContainEqual(expect.objectContaining({ outcome: 'denied', errorCode: 'scope_denied' }));
  });

  it("filters its country's sections by its market, and opens no record of another market", async () => {
    const { context, owner } = await world();
    const operator = await medellinOperator(context);
    const client = await signInClient(context, 'sub-3501');
    const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 1, startsAt: '2026-09-21T17:00:00' });
    await signInGoalkeeper(context, 'sub-3502');
    const local = await signInClient(context, 'sub-3503');
    context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(local.userId, { marketId: 'city-medellin', zoneIds: ['zone-bello'] }));

    const requests = await get(context, operator.token, '/admin/requests', 'country:country-co');
    const goalkeepers = await get(context, operator.token, '/admin/goalkeepers', 'country:country-co');
    const caliRequest = await get(context, operator.token, `/admin/requests/${created.requestId}`);
    const ownerView = await get(context, owner.token, `/admin/requests/${created.requestId}`);
    const markets = await get(context, operator.token, '/admin/markets');
    const caliMarket = await get(context, operator.token, '/admin/markets/city-cali');

    expect(requests.body.items).toEqual([]);
    expect(goalkeepers.body.items.map((item: { userId: string }) => item.userId)).toEqual([local.userId]);
    expect(caliRequest.status).toBe(404);
    expect(ownerView.status).toBe(200);
    expect(markets.body.items.map((market: { id: string }) => market.id)).toEqual(['city-medellin']);
    expect(caliMarket.status).toBe(404);
  });

  it('cannot create, enable, disable or delete markets, which a member of Colombia can (FR-041a)', async () => {
    const { context } = await world();
    const operator = await medellinOperator(context);
    const colombia = await signInStaff(context, { key: 'jefe-co', roleId: 'operador', scopes: [{ kind: 'country', id: 'country-co' }] });
    // The markets' country, as the admin's country store holds it.
    context.countryRepository.seed(context.quoteCountryRepository.countries.get('country-co')!);
    const post = (token: string, path: string, body: object) => request(context.app).post(path).set('Authorization', `Bearer ${token}`).send(body);
    const RIONEGRO = { name: 'Rionegro', countryId: 'country-co', timeZone: 'America/Bogota' };

    expect((await post(operator.token, '/admin/markets', RIONEGRO)).body.error).toBe('scope_denied');
    expect((await post(operator.token, '/admin/markets/city-medellin/disable', { revision: 0, reason: 'Cierre' })).body.error).toBe('scope_denied');
    expect((await post(operator.token, '/admin/markets/city-medellin/delete', { revision: 0 })).body.error).toBe('scope_denied');

    expect((await post(colombia.token, '/admin/markets', RIONEGRO)).status).toBe(201);
    expect((await post(colombia.token, '/admin/markets/city-medellin/disable', { revision: 0, reason: 'Cierre' })).status).toBe(200);
  });
});

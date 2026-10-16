import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { as, geographyStaff } from '../geographyTestHelpers.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { testMarket } from '../../fakes/fakeMarketRepository.js';

describe('/admin/readiness (admin spec 003, US3; spec 031)', () => {
  it("answers a country's dashboard: its items and every market with its summary", async () => {
    const context = await buildTestApp();
    const { reader } = await geographyStaff(context);
    context.marketRepository.seed(testMarket({ id: 'mkt-c1', name: 'Rionegro', countryId: 'c1', status: 'draft' }));
    const entries = context.adminAuditLog.entries.length;

    const response = await reader.get('/admin/readiness?countryId=c1');

    expect(response.status).toBe(200);
    expect(response.body.country).toMatchObject({ countryId: 'c1', name: 'Colombia', ready: false });
    expect(response.body.country.items.find((i: { key: string }) => i.key === 'currency')).toMatchObject({
      status: 'missing',
      target: { kind: 'admin', screen: 'country', id: 'c1' },
    });
    expect(response.body.markets).toEqual([{ marketId: 'mkt-c1', name: 'Rionegro', status: 'draft', ready: false, missingCount: expect.any(Number) }]);
    expect(context.adminAuditLog.entries.length).toBe(entries);
  });

  it("answers a market's checklist with its status", async () => {
    const context = await buildTestApp();
    const { reader } = await geographyStaff(context);

    const market = await reader.get('/admin/readiness?marketId=city-medellin');

    expect(market.body).toMatchObject({ marketId: 'city-medellin', status: 'enabled' });
    expect(market.body.items.map((i: { key: string }) => i.key)).toContain('zones');
  });

  it('needs exactly one of countryId and marketId; 404 for unknown ones; geography.read', async () => {
    const context = await buildTestApp();
    const { reader } = await geographyStaff(context);
    await seedRole(context, 'nada', ['staff.read']);
    const outsider = as(context, (await signInStaff(context, { key: 'otro', roleId: 'nada' })).token);

    expect((await reader.get('/admin/readiness')).status).toBe(400);
    expect((await reader.get('/admin/readiness?countryId=c1&marketId=city-medellin')).status).toBe(400);
    expect([(await reader.get('/admin/readiness?countryId=pe')).body.error]).toEqual(['country_not_found']);
    expect([(await reader.get('/admin/readiness?marketId=nope')).body.error]).toEqual(['market_not_found']);
    expect((await outsider.get('/admin/readiness?countryId=c1')).status).toBe(403);
  });
});

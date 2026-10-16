import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { as } from '../geographyTestHelpers.js';
import { pricingStaff } from '../pricingTestHelpers.js';
import { signInClient } from '../operatingBalanceTestHelpers.js';

const query = (params: Record<string, string>) =>
  `/admin/pricing/preview?${new URLSearchParams({ zoneId: 'zone-cali-norte', durationMinutes: '60', modality: 'any', startsAtLocal: '2026-09-21T14:00', ...params })}`;

describe('GET /admin/pricing/preview (admin spec 004, US4)', () => {
  it('breaks a quote down with the origin of each value, writing nothing', async () => {
    const context = await buildTestApp();
    const { reader } = await pricingStaff(context);
    const entriesBefore = context.adminAuditLog.entries.length;

    const response = await reader.get(query({}));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      zone: { id: 'zone-cali-norte', name: 'Norte' },
      timeZone: 'America/Bogota',
      quotable: { ok: true },
      rate: { amount: 40000, origin: { scope: 'zone', name: 'Norte' } },
      surcharge: { amount: 5000 },
      commission: { amount: 7000, origin: { scope: 'country', name: 'Colombia' } },
    });
    expect(context.adminAuditLog.entries.length).toBe(entriesBefore);
  });

  it('says why a start cannot be quoted, with where to fix it', async () => {
    const context = await buildTestApp();
    const { reader } = await pricingStaff(context);

    const tooSoon = await reader.get(query({ startsAtLocal: '2026-09-21T13:00' }));
    const fromEarlier = await reader.get(query({ startsAtLocal: '2026-09-21T13:00', quoteFromLocal: '2026-09-21T12:00' }));

    expect(tooSoon.body.quotable).toMatchObject({ ok: false, outcome: 'insufficient_notice', target: { screen: 'bookingSettings', id: 'city-cali' } });
    expect(fromEarlier.body).toMatchObject({ quotable: { ok: true }, leadMinutes: 60 });
  });

  it('answers the field it cannot read, and an unknown zone', async () => {
    const context = await buildTestApp();
    const { reader } = await pricingStaff(context);

    const badShape = await reader.get(query({ startsAtLocal: 'mañana' }));
    const after = await reader.get(query({ quoteFromLocal: '2026-09-21T15:00' }));
    const unknown = await reader.get(query({ zoneId: 'nope' }));

    expect([badShape.status, Object.keys(badShape.body.fieldErrors)]).toEqual([400, ['startsAtLocal']]);
    expect([after.status, after.body.fieldErrors]).toEqual([400, { quoteFromLocal: 'after_start' }]);
    expect([unknown.status, unknown.body.error]).toEqual([404, 'zone_not_found']);
  });

  it('lists where prices can hang for the pickers, with pricing.read alone', async () => {
    const context = await buildTestApp();
    const { reader } = await pricingStaff(context);

    const areas = await reader.get('/admin/pricing/areas');

    expect(areas.status).toBe(200);
    expect(areas.body.markets.find((market: { id: string }) => market.id === 'city-cali')).toMatchObject({
      name: 'Cali',
      countryId: 'country-co',
      zones: [{ id: 'zone-cali-norte', name: 'Norte', active: true }, { id: 'zone-cali-sur' }, { id: 'zone-cali-centro' }],
    });
    expect(areas.body.countries).toContainEqual({ id: 'country-co', name: 'Colombia', currency: 'COP' });
  });

  it('needs pricing.read and refuses mobile tokens', async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-0411');
    expect((await as(context, client.token).get(query({}))).status).toBe(401);
  });
});

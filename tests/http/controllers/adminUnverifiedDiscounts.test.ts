import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { as } from '../geographyTestHelpers.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import type { TestApp } from '../operatingBalanceTestHelpers.js';

async function staff(context: TestApp) {
  await seedRole(context, 'precios-lector', ['pricing.read']);
  await seedRole(context, 'precios-editor', ['pricing.read', 'pricing.manage']);
  await seedRole(context, 'descuentos', ['pricing.read', 'pricing.unverified_discount.manage']);
  const reader = await signInStaff(context, { key: 'precios-lector', roleId: 'precios-lector' });
  const priceEditor = await signInStaff(context, { key: 'precios-editor', roleId: 'precios-editor' });
  const discounts = await signInStaff(context, { key: 'descuentos', roleId: 'descuentos' });
  return { reader: as(context, reader.token), priceEditor: as(context, priceEditor.token), discounts: as(context, discounts.token) };
}

describe('/admin/unverified-discounts (admin spec 030, contracts D1–D4)', () => {
  it('sets the country, overrides a zone, edits and removes, auditing each write', async () => {
    const context = await buildTestApp();
    const { reader, discounts } = await staff(context);

    const country = await discounts.post('/admin/unverified-discounts', { scope: 'country', refId: 'country-co', discountBps: 1000 });
    const zone = await discounts.post('/admin/unverified-discounts', { scope: 'zone', refId: 'zone-cali-norte', discountBps: 1500 });
    expect([country.status, zone.status]).toEqual([201, 201]);

    const read = await reader.get('/admin/unverified-discounts?countryId=country-co');
    expect(read.status).toBe(200);
    expect(read.body.maxBps).toBe(3000);
    expect(read.body.zones.find((item: { id: string }) => item.id === 'zone-cali-norte').effective).toMatchObject({ discountBps: 1500, discountOrigin: 'zone' });
    expect(read.body.zones.find((item: { id: string }) => item.id === 'zone-cali-sur').effective).toMatchObject({ discountBps: 1000, discountOrigin: 'country', verifiedPriorityMinutes: 15 });

    const edited = await discounts.patch(`/admin/unverified-discounts/${zone.body.id}`, { revision: 0, discountBps: 2000, verifiedPriorityMinutes: 10 });
    expect(edited.status).toBe(200);
    const stale = await discounts.patch(`/admin/unverified-discounts/${zone.body.id}`, { revision: 0, discountBps: 2100 });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('stale_revision');
    const removed = await discounts.post(`/admin/unverified-discounts/${zone.body.id}/delete`, { revision: 1 });
    expect(removed.status).toBe(204);

    const done = context.adminAuditLog.entries.filter((entry) => entry.outcome === 'done').map((entry) => entry.action);
    expect(done).toEqual(['unverifiedDiscount.create', 'unverifiedDiscount.create', 'unverifiedDiscount.update', 'unverifiedDiscount.delete']);
  });

  it('refuses above the 30 % ceiling and a level that already has one', async () => {
    const context = await buildTestApp();
    const { discounts } = await staff(context);

    const tooMuch = await discounts.post('/admin/unverified-discounts', { scope: 'country', refId: 'country-co', discountBps: 3500 });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.fieldErrors).toHaveProperty('discountBps');

    await discounts.post('/admin/unverified-discounts', { scope: 'country', refId: 'country-co', discountBps: 1000 });
    const again = await discounts.post('/admin/unverified-discounts', { scope: 'country', refId: 'country-co', discountBps: 1200 });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('discount_already_exists');
  });

  it('reads with pricing.read and writes only with its own permission', async () => {
    const context = await buildTestApp();
    const { reader, priceEditor } = await staff(context);

    expect((await reader.get('/admin/unverified-discounts?countryId=country-co')).status).toBe(200);
    expect((await priceEditor.post('/admin/unverified-discounts', { scope: 'country', refId: 'country-co', discountBps: 1000 })).status).toBe(403);
    expect((await reader.get('/admin/unverified-discounts?countryId=nowhere')).status).toBe(404);
  });
});

describe('/admin/unverified-discounts by market (spec 031, US2)', () => {
  it("lets a market's discount win over the country's in its zones", async () => {
    const context = await buildTestApp();
    const { reader, discounts } = await staff(context);
    await discounts.post('/admin/unverified-discounts', { scope: 'country', refId: 'country-co', discountBps: 1000 });

    const market = await discounts.post('/admin/unverified-discounts', { scope: 'market', refId: 'city-cali', discountBps: 2000 });
    const city = await discounts.post('/admin/unverified-discounts', { scope: 'city', refId: 'city-cali', discountBps: 2000 });
    const read = await reader.get('/admin/unverified-discounts?countryId=country-co');

    expect([market.status, city.status]).toEqual([201, 400]);
    expect(read.body.zones.find((item: { id: string }) => item.id === 'zone-cali-sur').effective).toMatchObject({ discountBps: 2000, discountOrigin: 'market' });
  });
});

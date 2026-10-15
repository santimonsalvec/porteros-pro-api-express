import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import type { TestApp } from '../operatingBalanceTestHelpers.js';
import { GoalkeeperRegistration } from '../../../src/domain/goalkeepers/goalkeeperRegistration.js';

async function world() {
  const context = await buildTestApp();
  const stuck = GoalkeeperRegistration.createEmpty('reg-1', 'u-stuck');
  stuck.saveIdentification({ documentType: 'CC', documentNumber: '1020304050' });
  stuck.updatedAt = new Date(context.clock.now().getTime() - 10 * 86_400_000);
  context.goalkeeperRegistrationRepository.seed(stuck);
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  return { context, owner };
}

const get = (context: TestApp, token: string, path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`);

describe('registrations in progress in the admin (spec 005 of the admin, US7)', () => {
  it('lists them with a summary per step, filtered by step and idleness', async () => {
    const { context, owner } = await world();

    const all = await get(context, owner.token, '/admin/goalkeeper-registrations');
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ totalItems: 1, summary: { identification: 1, physicalData: 0, availability: 0, ready: 0 } });
    expect(all.body.items[0]).toMatchObject({ userId: 'u-stuck', step: 'identification', idleDays: 10 });
    expect((await get(context, owner.token, '/admin/goalkeeper-registrations?step=ready')).body.totalItems).toBe(0);
    expect((await get(context, owner.token, '/admin/goalkeeper-registrations?idleDaysMin=11')).body.totalItems).toBe(0);
    expect((await get(context, owner.token, '/admin/goalkeeper-registrations?step=nope')).status).toBe(400);
  });

  it('shows the detail without the document, and 404 for nobody', async () => {
    const { context, owner } = await world();

    const detail = await get(context, owner.token, '/admin/goalkeeper-registrations/u-stuck');
    expect(detail.status).toBe(200);
    expect(detail.body.sections.identification.fields.documentNumber).toBe('complete');
    expect(JSON.stringify(detail.body)).not.toContain('1020304050');
    const missing = await get(context, owner.token, '/admin/goalkeeper-registrations/nobody');
    expect([missing.status, missing.body.error]).toEqual([404, 'registration_not_found']);
  });

  it('needs goalkeepers.registrations.review', async () => {
    const { context } = await world();
    await seedRole(context, 'lector', ['goalkeepers.read']);
    const reader = await signInStaff(context, { key: 'lector', roleId: 'lector' });

    expect((await get(context, reader.token, '/admin/goalkeeper-registrations')).status).toBe(403);
    expect((await get(context, reader.token, '/admin/goalkeeper-registrations/u-stuck')).status).toBe(403);
  });
});

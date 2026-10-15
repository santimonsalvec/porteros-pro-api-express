import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { signInClient, type TestApp } from '../operatingBalanceTestHelpers.js';

/** A client with a complete profile (`Ana Portera`, WhatsApp `300 000 0001`) and an owner. */
async function world() {
  const context = await buildTestApp();
  const client = await signInClient(context, 'sub-0001');
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  return { context, client, owner };
}

const get = (context: TestApp, path: string, token?: string) => {
  const pending = request(context.app).get(path);
  return token ? pending.set('Authorization', `Bearer ${token}`) : pending;
};

describe('admin users (spec 005 of the admin, US1)', () => {
  it('lists users without their phone, filtered by search, role and country', async () => {
    const { context, client, owner } = await world();

    const all = await get(context, '/admin/users', owner.token);
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ page: 1, pageSize: 20 });
    expect(all.body.items).toContainEqual(expect.objectContaining({ id: client.userId, name: 'Ana Portera', countryCode: 'CO', isGoalkeeper: false, blocked: false }));
    expect(JSON.stringify(all.body)).not.toMatch(/3000000001|whatsApp/i);

    const searched = await get(context, '/admin/users?q=portera', owner.token);
    expect(searched.body.items.map((row: { id: string }) => row.id)).toEqual([client.userId]);
    const byPhone = await get(context, `/admin/users?q=${encodeURIComponent('300 000 0001')}`, owner.token);
    expect(byPhone.body.items.map((row: { id: string }) => row.id)).toEqual([client.userId]);
    expect((await get(context, '/admin/users?role=goalkeeper', owner.token)).body.items).toEqual([]);
    expect((await get(context, '/admin/users?countryCode=co&pageSize=5', owner.token)).body).toMatchObject({ pageSize: 5, totalItems: 1 });
  });

  it('refuses a malformed query', async () => {
    const { context, owner } = await world();

    for (const query of ['role=admin', 'createdFrom=01-10-2026', 'blocked=maybe', 'pageSize=500', 'q=' + 'x'.repeat(101)]) {
      const response = await get(context, `/admin/users?${query}`, owner.token);
      expect(response.status, query).toBe(400);
      expect(response.body.error).toBe('validation_failed');
    }
  });

  it('answers the detail without the phone, and 404 for nobody', async () => {
    const { context, client, owner } = await world();

    const detail = await get(context, `/admin/users/${client.userId}`, owner.token);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ id: client.userId, firstName: 'Ana', countryCallingCode: '+57', version: expect.any(String), block: null, requestCount: 0 });
    expect(detail.body).not.toHaveProperty('whatsAppNumber');

    const missing = await get(context, '/admin/users/nobody', owner.token);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('user_not_found');
  });

  it('shows the phone only on its own read, which the audit records without the number', async () => {
    const { context, client, owner } = await world();

    const response = await get(context, `/admin/users/${client.userId}/phone`, owner.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ countryCallingCode: '+57', whatsAppNumber: '300 000 0001' });
    const reads = context.adminAuditLog.entries.filter((entry) => entry.kind === 'read');
    expect(reads).toEqual([expect.objectContaining({ action: 'user.phone.read', resourceType: 'user', resourceId: client.userId, permission: 'users.read', outcome: 'done' })]);
    expect(JSON.stringify(context.adminAuditLog.entries)).not.toContain('0001');
  });

  it('answers phone_not_set for a user without a profile, and 404 for nobody, both audited as rejected', async () => {
    const { context, owner } = await world();

    const missing = await get(context, '/admin/users/owner-user/phone', owner.token);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('phone_not_set');
    expect((await get(context, '/admin/users/nobody/phone', owner.token)).body.error).toBe('user_not_found');
    expect(context.adminAuditLog.entries.filter((entry) => entry.kind === 'read').map((entry) => entry.outcome)).toEqual(['rejected', 'rejected']);
  });

  it.each(['/admin/users', '/admin/users/u-1', '/admin/users/u-1/phone'])('%s needs users.read, an admin session and not a mobile token', async (path) => {
    const { context, client } = await world();
    await seedRole(context, 'otro', ['goalkeepers.read']);
    const other = await signInStaff(context, { key: 'otro', roleId: 'otro' });

    expect((await get(context, path)).status).toBe(401);
    expect((await get(context, path, client.token)).status).toBe(401);
    expect((await get(context, path, other.token)).status).toBe(403);
  });
});

describe('correcting a user (spec 005 of the admin, US6)', () => {
  const patch = (context: TestApp, token: string, userId: string, body: object) =>
    request(context.app).patch(`/admin/users/${userId}`).set('Authorization', `Bearer ${token}`).send(body);

  it("corrects the name and WhatsApp; the app sees it; the audit keeps only the number's last 4 digits", async () => {
    const { context, client, owner } = await world();
    const { version } = (await get(context, `/admin/users/${client.userId}`, owner.token)).body;

    const response = await patch(context, owner.token, client.userId, { version, lastName: 'Gómez', countryCode: 'CO', whatsAppNumber: '301 555 1234' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: client.userId, lastName: 'Gómez', countryCallingCode: '+57', changedFields: ['lastName', 'whatsAppNumber'] });
    expect(JSON.stringify(response.body)).not.toContain('5551234');
    const write = context.adminAuditLog.entries.find((entry) => entry.action === 'user.update')!;
    expect(write).toMatchObject({ kind: 'write', permission: 'users.update', before: { lastName: 'Portera', numberEnding: '0001' }, after: { lastName: 'Gómez', numberEnding: '1234' } });
    expect(JSON.stringify(write)).not.toMatch(/5551234|3000000001|300 000 0001/);
    const phone = await get(context, `/admin/users/${client.userId}/phone`, owner.token);
    expect(phone.body.whatsAppNumber).toBe('301 555 1234');
  });

  it('answers each refusal with its code, never saying who has a number', async () => {
    const { context, client, owner } = await world();
    const other = await signInClient(context, 'sub-0009');
    const { version } = (await get(context, `/admin/users/${client.userId}`, owner.token)).body;

    const cases: [object, number, string][] = [
      [{ lastName: 'X' }, 400, 'validation_failed'],
      [{ version, firstName: '' }, 400, 'validation_failed'],
      [{ version, countryCode: 'ZZ', whatsAppNumber: '3001112222' }, 409, 'invalid_country_code'],
      [{ version, countryCode: 'CO', whatsAppNumber: '300 000 0009' }, 409, 'duplicate_phone_number'],
      [{ version: 'old', firstName: 'Otra' }, 409, 'stale_revision'],
    ];
    for (const [body, status, code] of cases) {
      const response = await patch(context, owner.token, client.userId, body);
      expect([response.status, response.body.error], JSON.stringify(body)).toEqual([status, code]);
      expect(JSON.stringify(response.body)).not.toContain(other.userId);
    }
    expect((await patch(context, owner.token, 'owner-user', { version, firstName: 'X' })).body.error).toBe('profile_incomplete');
    expect((await patch(context, owner.token, 'nobody', { version, firstName: 'X' })).status).toBe(404);
  });

  it('needs users.update', async () => {
    const { context, client } = await world();
    await seedRole(context, 'lector', ['users.read']);
    const reader = await signInStaff(context, { key: 'lector', roleId: 'lector' });

    expect((await patch(context, reader.token, client.userId, { version: 'x', firstName: 'X' })).status).toBe(403);
  });
});

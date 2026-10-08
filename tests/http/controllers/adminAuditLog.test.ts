import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { signInClient, type TestApp } from '../walletTestHelpers.js';
import type { AuditEntry } from '../../../src/domain/staff/auditEntry.js';

const get = (context: TestApp, token: string, path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`);

function entry(n: number, extra: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: `a-${String(n).padStart(4, '0')}`,
    at: new Date(Date.UTC(2026, 8, 1) + n * 60_000),
    kind: 'write',
    actor: { staffId: n % 2 === 0 ? 'staff-even' : 'staff-odd', userId: 'u', email: 'x@porteros.pro' },
    sessionId: 'sid',
    permission: 'pricing.manage',
    action: n % 3 === 0 ? 'taxSettings.update' : 'wallet.adjust',
    resourceType: n % 3 === 0 ? 'taxSettings' : 'wallet',
    resourceId: 'r',
    outcome: n % 5 === 0 ? 'denied' : 'done',
    httpStatus: 200,
    errorCode: null,
    before: { vatRateBps: 0 },
    after: { vatRateBps: 1900 },
    request: null,
    ip: '1.2.3.4',
    userAgent: 'Firefox',
    ...extra,
  };
}

async function seeded(count: number) {
  const context = await buildTestApp();
  const owner = await signInStaff(context, { key: 'dueno' });
  for (let n = 1; n <= count; n += 1) await context.adminAuditLog.append(entry(n));
  return { context, owner };
}

describe('GET /admin/audit-log (spec 002, US4)', () => {
  it('walks 120 entries 50 at a time without repeating or missing one, even as new ones arrive', async () => {
    const { context, owner } = await seeded(120);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const response = await get(context, owner.token, `/admin/audit-log?limit=50${cursor ? `&cursor=${cursor}` : ''}`);
      expect(response.status).toBe(200);
      seen.push(...response.body.items.map((item: { id: string }) => item.id));
      cursor = response.body.nextCursor;
      pages += 1;
      await context.adminAuditLog.append(entry(1000 + pages));
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
    expect(seen[0]).toBe('a-0120');
    expect(seen.at(-1)).toBe('a-0001');
  });

  it('filters by member, resource, action, outcome and dates', async () => {
    const { context, owner } = await seeded(30);
    const ids = async (query: string) =>
      (await get(context, owner.token, `/admin/audit-log?${query}`)).body.items.map((item: { id: string }) => Number(item.id.slice(2)));

    expect((await ids('staffId=staff-even')).every((n: number) => n % 2 === 0)).toBe(true);
    expect((await ids('resourceType=taxSettings')).every((n: number) => n % 3 === 0)).toBe(true);
    expect((await ids('action=wallet.adjust')).every((n: number) => n % 3 !== 0)).toBe(true);
    expect(await ids('outcome=denied')).toEqual([30, 25, 20, 15, 10, 5]);
    expect(await ids(`from=${new Date(Date.UTC(2026, 8, 1) + 10 * 60_000).toISOString()}&to=${new Date(Date.UTC(2026, 8, 1) + 12 * 60_000).toISOString()}`)).toEqual([
      12, 11, 10,
    ]);
  });

  it('400 for a bad cursor, a reversed range or a bad value', async () => {
    const { context, owner } = await seeded(1);

    const cursor = await get(context, owner.token, '/admin/audit-log?cursor=zzz!');
    const range = await get(context, owner.token, '/admin/audit-log?from=2026-10-02T00:00:00.000Z&to=2026-10-01T00:00:00.000Z');
    const outcome = await get(context, owner.token, '/admin/audit-log?outcome=maybe');
    const limit = await get(context, owner.token, '/admin/audit-log?limit=101');

    expect([cursor.status, cursor.body.fieldErrors?.cursor]).toEqual([400, expect.any(String)]);
    expect([range.status, range.body.fieldErrors?.from]).toEqual([400, expect.any(String)]);
    expect(outcome.status).toBe(400);
    expect(limit.status).toBe(400);
  });

  it('reads one entry in full, 404 otherwise', async () => {
    const { context, owner } = await seeded(3);

    const detail = await get(context, owner.token, '/admin/audit-log/a-0002');
    const missing = await get(context, owner.token, '/admin/audit-log/missing');

    expect(detail.body).toMatchObject({ id: 'a-0002', before: { vatRateBps: 0 }, after: { vatRateBps: 1900 }, ip: '1.2.3.4', actor: { type: 'staff' } });
    expect([missing.status, missing.body.error]).toEqual([404, 'audit_entry_not_found']);
  });

  it('reading the log adds nothing to it', async () => {
    const { context, owner } = await seeded(2);

    await get(context, owner.token, '/admin/audit-log');
    await get(context, owner.token, '/admin/audit-log/a-0001');

    expect(context.adminAuditLog.entries).toHaveLength(2);
  });

  it('401 without a token or with an app token; 403 without audit.read', async () => {
    const { context } = await seeded(1);
    const client = await signInClient(context, 'sub-0001');
    await seedRole(context, 'otro', ['staff.read']);
    const member = await signInStaff(context, { key: 'otro', roleId: 'otro' });

    expect((await request(context.app).get('/admin/audit-log')).status).toBe(401);
    expect((await get(context, client.token, '/admin/audit-log')).status).toBe(401);
    expect((await get(context, member.token, '/admin/audit-log')).status).toBe(403);
    expect((await get(context, member.token, '/admin/audit-log/a-0001')).status).toBe(403);
  });
});

describe('team endpoints in the API document (spec 002)', () => {
  it('documents the 11 team endpoints with their methods', async () => {
    const context = await buildTestApp();
    const { paths } = (await request(context.app).get('/openapi.json')).body as { paths: Record<string, Record<string, unknown>> };
    const methods = (path: string) => Object.keys(paths[path] ?? {}).sort();
    expect(methods('/admin/staff')).toEqual(['get', 'post']);
    expect(methods('/admin/staff/{staffId}')).toEqual(['get', 'patch']);
    expect(methods('/admin/staff/{staffId}/disable')).toEqual(['post']);
    expect(methods('/admin/staff/{staffId}/enable')).toEqual(['post']);
    expect(methods('/admin/roles')).toEqual(['get', 'post']);
    expect(methods('/admin/roles/{roleId}')).toEqual(['get', 'put']);
    expect(methods('/admin/roles/{roleId}/delete')).toEqual(['post']);
    expect(methods('/admin/audit-log')).toEqual(['get']);
    expect(methods('/admin/audit-log/{entryId}')).toEqual(['get']);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { ListAuditLogQuery } from '../../../../../src/application/features/staff/queries/listAuditLog/listAuditLogQuery.js';
import { ListAuditLogQueryHandler } from '../../../../../src/application/features/staff/queries/listAuditLog/listAuditLogQueryHandler.js';
import { GetAuditEntryQuery } from '../../../../../src/application/features/staff/queries/getAuditEntry/getAuditEntryQuery.js';
import { GetAuditEntryQueryHandler } from '../../../../../src/application/features/staff/queries/getAuditEntry/getAuditEntryQueryHandler.js';
import { encodeAuditCursor } from '../../../../../src/application/features/staff/common/auditCursor.js';
import type { AuditEntry } from '../../../../../src/domain/staff/auditEntry.js';
import { FakeAdminAuditLog } from '../../../../fakes/fakeAdminAuditLog.js';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 8, 14, minute));
const entry = (n: number, extra: Partial<AuditEntry> = {}): AuditEntry => ({
  id: `a-${String(n).padStart(3, '0')}`,
  at: at(n),
  kind: 'write',
  actor: { staffId: 'staff-1', userId: 'user-1', email: 'ana@porteros.pro' },
  sessionId: 'sid-1',
  permission: 'staff.manage',
  action: 'staff.disable',
  resourceType: 'staffMember',
  resourceId: 'staff-2',
  outcome: 'done',
  httpStatus: 200,
  errorCode: null,
  before: { status: 'active' },
  after: { status: 'disabled' },
  request: { reason: 'Salió' },
  ip: '1.2.3.4',
  userAgent: 'Firefox',
  ...extra,
});

describe('ListAuditLogQueryHandler / GetAuditEntryQueryHandler', () => {
  let log: FakeAdminAuditLog;
  let list: ListAuditLogQueryHandler;

  beforeEach(async () => {
    log = new FakeAdminAuditLog();
    for (let n = 1; n <= 5; n += 1) await log.append(entry(n));
    await log.append(entry(6, { actor: { system: 'script', name: 'seed-owner' }, sessionId: null, outcome: 'denied' }));
    list = new ListAuditLogQueryHandler({ auditLog: log });
  });

  it('pages newest first with a cursor after the last entry shown, and none on the last page', async () => {
    const first = await list.handle(new ListAuditLogQuery({}, null, 4));
    expect(first).toMatchObject({ outcome: 'ok' });
    if (first.outcome !== 'ok') throw new Error('unreachable');
    expect(first.items.map((item) => item.id)).toEqual(['a-006', 'a-005', 'a-004', 'a-003']);
    expect(first.nextCursor).toBe(encodeAuditCursor({ at: at(3), id: 'a-003' }));

    const second = await list.handle(new ListAuditLogQuery({}, first.nextCursor, 4));
    if (second.outcome !== 'ok') throw new Error('unreachable');
    expect(second.items.map((item) => item.id)).toEqual(['a-002', 'a-001']);
    expect(second.nextCursor).toBeNull();
  });

  it('labels who acted, without the before/after in the list', async () => {
    const result = await list.handle(new ListAuditLogQuery({}, null, 2));
    if (result.outcome !== 'ok') throw new Error('unreachable');

    expect(result.items[0]!.actor).toEqual({ type: 'script', staffId: null, label: 'Script de operación (seed-owner)' });
    expect(result.items[1]!.actor).toEqual({ type: 'staff', staffId: 'staff-1', label: 'ana@porteros.pro' });
    expect(result.items[1]).not.toHaveProperty('before');
  });

  it('passes the filters through', async () => {
    const result = await list.handle(new ListAuditLogQuery({ outcome: 'denied' }, null, 50));
    if (result.outcome !== 'ok') throw new Error('unreachable');
    expect(result.items.map((item) => item.id)).toEqual(['a-006']);
  });

  it('refuses a bad cursor and a reversed range', async () => {
    expect(await list.handle(new ListAuditLogQuery({}, 'not-a-cursor!', 10))).toEqual({ outcome: 'invalid_cursor' });
    expect(await list.handle(new ListAuditLogQuery({ from: at(5), to: at(1) }, null, 10))).toEqual({ outcome: 'invalid_range' });
  });

  it('reads one entry in full, or says it does not exist', async () => {
    const get = new GetAuditEntryQueryHandler({ auditLog: log });

    expect(await get.handle(new GetAuditEntryQuery('a-002'))).toMatchObject({
      outcome: 'ok',
      entry: { id: 'a-002', before: { status: 'active' }, after: { status: 'disabled' }, request: { reason: 'Salió' }, ip: '1.2.3.4', userAgent: 'Firefox' },
    });
    expect(await get.handle(new GetAuditEntryQuery('missing'))).toEqual({ outcome: 'audit_entry_not_found' });
  });
});

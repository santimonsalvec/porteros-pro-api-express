import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { MongoAdminAuditLog } from '../../../../../src/infrastructure/persistence/mongo/adminAuditLogRepository.js';
import type { AuditEntry } from '../../../../../src/domain/staff/auditEntry.js';
import { createFakeCollection, toArrayCursor } from '../../../../fakes/fakeMongoCollection.js';

const dbWith = (collection: ReturnType<typeof createFakeCollection>) =>
  ({ collection: (name: string) => (name === 'adminAuditLog' ? collection : null) as unknown as Collection<Document> }) as unknown as Db;

const ENTRY: AuditEntry = {
  id: 'a-1',
  at: new Date('2026-10-08T14:00:00.000Z'),
  kind: 'write',
  actor: { staffId: 'staff-1', userId: 'user-1', email: 'ana@porteros.pro' },
  sessionId: 'sid-1',
  permission: 'pricing.manage',
  action: 'taxSettings.update',
  resourceType: 'taxSettings',
  resourceId: 'country-co',
  outcome: 'done',
  httpStatus: 200,
  errorCode: null,
  before: { vatRateBps: 0 },
  after: { vatRateBps: 1900 },
  request: { vatRateBps: 1900 },
  ip: '1.2.3.4',
  userAgent: 'Firefox',
};

const ENTRY_DOC = Object.fromEntries(Object.entries(ENTRY).filter(([key]) => key !== 'id'));

describe('MongoAdminAuditLog', () => {
  it('appends the entry as one document', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({});

    await new MongoAdminAuditLog(dbWith(collection)).append(ENTRY);

    const { id, ...rest } = ENTRY;
    expect(collection.insertOne).toHaveBeenCalledWith({ _id: id, ...rest });
  });

  it('replaces the time index with a stable one and adds the filter indexes, still without expiry', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');
    collection.dropIndex.mockResolvedValue({});

    await new MongoAdminAuditLog(dbWith(collection)).ensureIndexes();

    expect(collection.dropIndex).toHaveBeenCalledWith('at_desc');
    expect(collection.createIndex.mock.calls).toEqual([
      [{ at: -1, _id: -1 }, { name: 'at_id_desc' }],
      [{ 'actor.staffId': 1, at: -1 }, { name: 'actor_at' }],
      [{ resourceType: 1, resourceId: 1, at: -1 }, { name: 'resource_at' }],
      [{ action: 1, at: -1 }, { name: 'action_at' }],
      [{ outcome: 1, at: -1 }, { name: 'outcome_at' }],
    ]);
  });

  it('lists newest first with every filter, after a position, one more than asked', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([{ _id: 'a-1', ...ENTRY_DOC }]);
    collection.find.mockReturnValue(cursor);
    const at = new Date('2026-10-08T15:00:00.000Z');

    const items = await new MongoAdminAuditLog(dbWith(collection)).list({
      staffId: 'staff-1',
      resourceType: 'taxSettings',
      action: 'taxSettings.update',
      outcome: 'done',
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: new Date('2026-10-09T00:00:00.000Z'),
      after: { at, id: 'a-9' },
      limit: 50,
    });

    expect(collection.find).toHaveBeenCalledWith({
      'actor.staffId': 'staff-1',
      resourceType: 'taxSettings',
      action: 'taxSettings.update',
      outcome: 'done',
      at: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-09T00:00:00.000Z') },
      $or: [{ at: { $lt: at } }, { at, _id: { $lt: 'a-9' } }],
    });
    expect(cursor.sort).toHaveBeenCalledWith({ at: -1, _id: -1 });
    expect(cursor.limit).toHaveBeenCalledWith(50);
    expect(items).toEqual([{ ...ENTRY, id: 'a-1' }]);
  });

  it('reads one entry by id', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValueOnce({ _id: 'a-1', ...ENTRY_DOC }).mockResolvedValueOnce(null);
    const log = new MongoAdminAuditLog(dbWith(collection));

    expect(await log.getById('a-1')).toEqual({ ...ENTRY, id: 'a-1' });
    expect(await log.getById('missing')).toBeNull();
  });

  it('offers no way to change or remove an entry', () => {
    const methods = Object.getOwnPropertyNames(MongoAdminAuditLog.prototype);

    expect(methods.filter((name) => /update|delete|remove|replace/i.test(name))).toEqual([]);
  });

  it('lists everything without filters, and only a lower bound with just `from`', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayCursor([]));
    const log = new MongoAdminAuditLog(dbWith(collection));
    const from = new Date('2026-10-01T05:00:00.000Z');

    await log.list({ limit: 51 });
    await log.list({ from, limit: 51 });

    expect(collection.find).toHaveBeenNthCalledWith(1, {});
    expect(collection.find).toHaveBeenNthCalledWith(2, { at: { $gte: from } });
  });
});

import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { VettingLogRepository } from '../../../../../src/infrastructure/persistence/mongo/vettingLogRepository.js';
import type { VettingLogEntry } from '../../../../../src/domain/goalkeepers/vettingLogEntry.js';
import { createFakeCollection, toArrayCursor } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new VettingLogRepository(db);
}

const entry: VettingLogEntry = {
  id: 'log-1',
  goalkeeperId: 'gk-1',
  at: new Date('2026-10-15T15:00:00.000Z'),
  actor: { kind: 'staff', userId: 'staff-1' },
  action: 'verification.granted',
  method: 'referral',
  reason: null,
  details: { referrerId: 'gk-9' },
};

describe('VettingLogRepository (mocked driver, admin spec 030)', () => {
  it('lists a goalkeeper newest first', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');

    await repositoryWith(collection).ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ goalkeeperId: 1, at: -1, _id: -1 }, { name: 'goalkeeper_at' });
  });

  it('appends an entry and reads it back', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({});
    const repository = repositoryWith(collection);

    await repository.append(entry);
    const stored = collection.insertOne.mock.calls[0]![0] as Document;
    expect(stored).toEqual({ _id: 'log-1', goalkeeperId: 'gk-1', at: entry.at, actor: entry.actor, action: entry.action, method: 'referral', reason: null, details: entry.details });

    const cursor = toArrayCursor([stored]);
    collection.find.mockReturnValue(cursor);
    expect(await repository.listForGoalkeeper('gk-1', 50)).toEqual([entry]);
    expect(collection.find).toHaveBeenCalledWith({ goalkeeperId: 'gk-1' });
    expect(cursor.sort).toHaveBeenCalledWith({ at: -1, _id: -1 });
    expect(cursor.limit).toHaveBeenCalledWith(50);
  });
});

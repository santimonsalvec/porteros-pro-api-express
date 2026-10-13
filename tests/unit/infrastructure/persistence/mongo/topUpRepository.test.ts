import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import type { TopUpCheck } from '../../../../../src/domain/payments/topUp.js';
import { TopUpRepository } from '../../../../../src/infrastructure/persistence/mongo/topUpRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

// Admin spec 007 (research §1–§3): the checks a top-up keeps, the 30-second hold and the indexes.

const NOW = new Date('2026-10-13T22:31:00.000Z');

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new TopUpRepository(db);
}

const check = (overrides: Partial<TopUpCheck> = {}): TopUpCheck => ({
  at: NOW,
  lastAt: NOW,
  by: 'sweep',
  staffUserId: null,
  answer: 'UNAVAILABLE',
  result: 'failed',
  statusAfter: 'pending',
  repeats: 1,
  ...overrides,
});

describe('TopUpRepository checks (mocked driver)', () => {
  it('appends a new check, keeping the last 50, without touching the schedule', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 't-1', checkLog: [check({ answer: 'PENDING', result: 'still_pending' })] });
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });

    await repositoryWith(collection).recordCheck('t-1', check());

    expect(collection.findOne).toHaveBeenCalledWith({ _id: 't-1' }, { projection: { checkLog: { $slice: -1 } } });
    expect(collection.updateOne).toHaveBeenCalledWith({ _id: 't-1' }, { $push: { checkLog: { $each: [check()], $slice: -50 } } });
    const update = collection.updateOne.mock.calls[0]![1] as Document;
    expect(JSON.stringify(update)).not.toMatch(/nextCheckAt|checks"/);
  });

  it('starts the log of a top-up that had none', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 't-1' });
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });

    await repositoryWith(collection).recordCheck('t-1', check());

    expect(collection.updateOne).toHaveBeenCalledWith({ _id: 't-1' }, { $push: { checkLog: { $each: [check()], $slice: -50 } } });
  });

  it('folds an equal check into the last one: its latest time and one more repeat', async () => {
    const collection = createFakeCollection();
    const first = new Date('2026-10-13T22:20:00.000Z');
    collection.findOne.mockResolvedValue({ _id: 't-1', checkLog: [check({ at: first, lastAt: first, repeats: 3 })] });
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });

    await repositoryWith(collection).recordCheck('t-1', check());

    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: 't-1' },
      { $set: { 'checkLog.$[last].lastAt': NOW }, $inc: { 'checkLog.$[last].repeats': 1 } },
      { arrayFilters: [{ 'last.at': first }] },
    );
  });

  it('does nothing for a top-up that does not exist', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);

    await repositoryWith(collection).recordCheck('nope', check());

    expect(collection.updateOne).not.toHaveBeenCalled();
  });

  it('holds a top-up for 30 seconds only when nobody else holds it', async () => {
    const collection = createFakeCollection();
    collection.findOneAndUpdate.mockResolvedValueOnce({ _id: 't-1' }).mockResolvedValueOnce(null);
    const repository = repositoryWith(collection);

    expect(await repository.acquireCheckLease('t-1', NOW)).toBe(true);
    expect(await repository.acquireCheckLease('t-1', NOW)).toBe(false);
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 't-1', $or: [{ checkLeaseUntil: null }, { checkLeaseUntil: { $exists: false } }, { checkLeaseUntil: { $lte: NOW } }] },
      { $set: { checkLeaseUntil: new Date(NOW.getTime() + 30_000) } },
      { projection: { _id: 1 } },
    );
  });

  it('lets go of the hold', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });

    await repositoryWith(collection).releaseCheckLease('t-1');

    expect(collection.updateOne).toHaveBeenCalledWith({ _id: 't-1' }, { $set: { checkLeaseUntil: null } });
  });

  it('creates the indexes of the admin lists apart from the existing ones', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');

    await repositoryWith(collection).ensureAdminIndexes();

    const names = collection.createIndex.mock.calls.map((call) => (call[1] as { name: string }).name);
    expect(names).toEqual(['created_id', 'status_created', 'country_created']);
    expect(collection.createIndex).toHaveBeenCalledWith({ createdAt: -1, _id: -1 }, { name: 'created_id' });
    expect(collection.createIndex).toHaveBeenCalledWith({ status: 1, createdAt: -1, _id: -1 }, { name: 'status_created' });
    expect(collection.createIndex).toHaveBeenCalledWith({ countryId: 1, createdAt: -1, _id: -1 }, { name: 'country_created' });
  });

  it('reads one top-up by id, and counts those of a goalkeeper', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValueOnce(null);
    collection.countDocuments.mockResolvedValue(3);
    const repository = repositoryWith(collection);

    expect(await repository.getById('nope')).toBeNull();
    expect(collection.findOne).toHaveBeenCalledWith({ _id: 'nope' });
    expect(await repository.countForGoalkeeper('gk-1')).toBe(3);
    expect(collection.countDocuments).toHaveBeenCalledWith({ goalkeeperId: 'gk-1' });
  });
});

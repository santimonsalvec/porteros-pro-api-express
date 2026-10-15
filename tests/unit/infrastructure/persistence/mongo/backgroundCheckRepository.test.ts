import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { BackgroundCheckRepository } from '../../../../../src/infrastructure/persistence/mongo/backgroundCheckRepository.js';
import { BackgroundCheck } from '../../../../../src/domain/goalkeepers/backgroundCheck.js';
import { createFakeCollection, toArrayCursor } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new BackgroundCheckRepository(db);
}

const UPLOADED = new Date('2026-10-10T12:00:00.000Z');
const REVIEWED = new Date('2026-10-15T15:00:00.000Z');
const pending = BackgroundCheck.upload('bc-1', 'gk-1', 'img-1', UPLOADED);

describe('BackgroundCheckRepository (mocked driver, admin spec 030)', () => {
  it('indexes a goalkeeper\'s checks and the expiry alerts', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');

    await repositoryWith(collection).ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ goalkeeperId: 1, uploadedAt: -1 }, { name: 'goalkeeper_uploaded' });
    expect(collection.createIndex).toHaveBeenCalledWith({ status: 1, expiresAt: 1 }, { name: 'status_expires' });
  });

  it('adds a check and lists a goalkeeper\'s, newest first', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({});
    const repository = repositoryWith(collection);

    await repository.add(pending);
    const stored = collection.insertOne.mock.calls[0]![0] as Document;
    expect(stored).toMatchObject({ _id: 'bc-1', goalkeeperId: 'gk-1', imageId: 'img-1', status: 'pending', revision: 0 });

    const cursor = toArrayCursor([stored]);
    collection.find.mockReturnValue(cursor);
    expect(await repository.listForGoalkeeper('gk-1')).toEqual([pending]);
    expect(collection.find).toHaveBeenCalledWith({ goalkeeperId: 'gk-1' });
    expect(cursor.sort).toHaveBeenCalledWith({ uploadedAt: -1, _id: -1 });
  });

  it('saves a review only at the revision it was read', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    const repository = repositoryWith(collection);
    const approved = pending.approve('staff-1', REVIEWED);

    expect(await repository.saveReview(approved, 0)).toBe('saved');
    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: 'bc-1', $or: [{ revision: 0 }, { revision: { $exists: false } }] },
      {
        $set: { status: 'approved', reviewedAt: REVIEWED, reviewedBy: 'staff-1', rejectionReason: null, expiresAt: approved.expiresAt },
        $inc: { revision: 1 },
      },
    );

    collection.updateOne.mockResolvedValue({ matchedCount: 0 });
    expect(await repository.saveReview(approved, 0)).toBe('stale');
  });

  it('deletes only a pending check of its owner', async () => {
    const collection = createFakeCollection();
    collection.deleteOne.mockResolvedValue({ deletedCount: 1 });
    const repository = repositoryWith(collection);

    expect(await repository.deletePending('bc-1', 'gk-1')).toBe('deleted');
    expect(collection.deleteOne).toHaveBeenCalledWith({ _id: 'bc-1', goalkeeperId: 'gk-1', status: 'pending' });

    collection.deleteOne.mockResolvedValue({ deletedCount: 0 });
    collection.findOne.mockResolvedValue({ _id: 'bc-1', goalkeeperId: 'gk-1', status: 'approved' });
    expect(await repository.deletePending('bc-1', 'gk-1')).toBe('reviewed');

    collection.findOne.mockResolvedValue(null);
    expect(await repository.deletePending('bc-1', 'gk-1')).toBe('not_found');
    expect(collection.findOne).toHaveBeenLastCalledWith({ _id: 'bc-1', goalkeeperId: 'gk-1' });
  });

  it('finds one check by id and owner', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);

    expect(await repositoryWith(collection).findForGoalkeeper('bc-9', 'gk-1')).toBeNull();
    expect(collection.findOne).toHaveBeenCalledWith({ _id: 'bc-9', goalkeeperId: 'gk-1' });
  });
});

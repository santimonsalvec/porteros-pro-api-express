import { describe, expect, it } from 'vitest';
import type { Collection, Document } from 'mongodb';
import { updateAtRevision } from '../../../../../src/infrastructure/persistence/mongo/revisionWrite.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

const asCollection = (fake: ReturnType<typeof createFakeCollection>) => fake as unknown as Collection<Document>;

describe('updateAtRevision', () => {
  it('writes only at the revision read and bumps it', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const result = await updateAtRevision(asCollection(collection), 'med', 3, { name: 'Medellín' });

    expect(result).toBe('saved');
    expect(collection.updateOne).toHaveBeenCalledWith({ _id: 'med', revision: 3 }, { $set: { name: 'Medellín' }, $inc: { revision: 1 } });
  });

  it('treats a seeded document without revision as revision 0', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });

    await updateAtRevision(asCollection(collection), 'med', 0, { name: 'x' });

    expect(collection.updateOne.mock.calls[0]![0]).toEqual({ _id: 'med', $or: [{ revision: 0 }, { revision: { $exists: false } }] });
  });

  it("is stale when nothing matched (someone saved first, or it is gone)", async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 0 });

    expect(await updateAtRevision(asCollection(collection), 'med', 2, { name: 'x' })).toBe('stale');
  });
});

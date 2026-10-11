import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { InvalidConfigurationError } from '../../../../../src/domain/pricing/invalidConfigurationError.js';
import { MatchSurfaceRepository } from '../../../../../src/infrastructure/persistence/mongo/matchSurfaceRepository.js';
import { MatchSurface } from '../../../../../src/domain/pricing/matchSurface.js';
import { createFakeCollection, toArrayCursor } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new MatchSurfaceRepository(db);
}

const synthetic = { _id: 'synthetic_grass', name: 'Grama sintética', active: true, order: 1 };

describe('MatchSurfaceRepository (mocked driver)', () => {
  it('lists only active surfaces, by order then name', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([synthetic]);
    collection.find.mockReturnValue(cursor);

    const surfaces = await repositoryWith(collection).listActive();

    expect(collection.find).toHaveBeenCalledWith({ active: true });
    expect(cursor.sort).toHaveBeenCalledWith({ order: 1, name: 1 });
    expect(surfaces.map((surface) => surface.id)).toEqual(['synthetic_grass']);
  });

  it('finds one surface by id, active or not', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ ...synthetic, active: false });

    const surface = await repositoryWith(collection).findById('synthetic_grass');

    expect(collection.findOne).toHaveBeenCalledWith({ _id: 'synthetic_grass' });
    expect(surface).toMatchObject({ id: 'synthetic_grass', active: false });
  });

  it('answers null for an unknown id', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);

    expect(await repositoryWith(collection).findById('lava')).toBeNull();
  });

  it('throws on a malformed surface instead of skipping it', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayCursor([{ ...synthetic, name: '' }]));

    await expect(repositoryWith(collection).listActive()).rejects.toThrow(InvalidConfigurationError);
  });
});

describe('MatchSurfaceRepository admin methods (spec 003)', () => {
  it('lists every surface or only active or inactive ones, by order', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([synthetic]);
    collection.find.mockReturnValue(cursor);
    collection.countDocuments.mockResolvedValue(1);
    const repository = repositoryWith(collection);

    await repository.list({ active: false, page: 1, pageSize: 20 });
    expect(collection.find).toHaveBeenLastCalledWith({ active: false });
    await repository.list({ page: 1, pageSize: 20 });
    expect(collection.find).toHaveBeenLastCalledWith({});
    expect(cursor.sort).toHaveBeenCalledWith({ order: 1, _id: 1 });
  });

  it('gets one, creates, updates at the revision read and deletes', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(synthetic);
    collection.updateOne.mockResolvedValue({ matchedCount: 0 });
    collection.deleteOne.mockResolvedValue({ deletedCount: 1 });
    const repository = repositoryWith(collection);
    const arena = new MatchSurface({ id: 'arena', name: 'Arena', active: true, order: 6 });

    expect((await repository.getById('synthetic_grass'))?.name).toBe('Grama sintética');
    await repository.create(arena);
    expect(collection.insertOne).toHaveBeenCalledWith({ _id: 'arena', name: 'Arena', active: true, order: 6, revision: 0 });
    expect(await repository.update(arena)).toBe('stale');
    expect(await repository.delete('arena')).toBe(true);
  });
});

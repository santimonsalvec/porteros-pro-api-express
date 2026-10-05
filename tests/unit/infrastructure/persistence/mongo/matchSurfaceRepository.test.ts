import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { InvalidConfigurationError } from '../../../../../src/domain/pricing/invalidConfigurationError.js';
import { MatchSurfaceRepository } from '../../../../../src/infrastructure/persistence/mongo/matchSurfaceRepository.js';
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

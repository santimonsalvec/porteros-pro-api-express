import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { InvalidConfigurationError } from '../../../../../src/domain/pricing/invalidConfigurationError.js';
import { RentalRateRepository } from '../../../../../src/infrastructure/persistence/mongo/rentalRateRepository.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new RentalRateRepository(db);
}

const zoneDoc = { _id: 'rate-zone', scope: 'zone', refId: 'zone-1', durationMinutes: 60, amount: 45000 };
const cityDoc = { _id: 'rate-city', scope: 'city', refId: 'city-1', durationMinutes: 60, amount: 40000 };

describe('RentalRateRepository (mocked driver)', () => {
  it('queries the zone and city rows for the duration in a single find', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([]));
    const repository = repositoryWith(collection);

    await repository.findForDuration('zone-1', 'city-1', 60);

    expect(collection.find).toHaveBeenCalledTimes(1);
    expect(collection.find).toHaveBeenCalledWith({
      durationMinutes: 60,
      $or: [
        { scope: 'zone', refId: 'zone-1' },
        { scope: 'city', refId: 'city-1' },
      ],
    });
  });

  it('splits the results into zone and city rates', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([cityDoc, zoneDoc]));
    const repository = repositoryWith(collection);

    const found = await repository.findForDuration('zone-1', 'city-1', 60);

    expect(found.zone.map((rate) => rate.amount)).toEqual([45000]);
    expect(found.city.map((rate) => rate.amount)).toEqual([40000]);
  });

  it('keeps every modality/level variant of a level (feature 024)', async () => {
    const collection = createFakeCollection();
    const f11 = { ...cityDoc, _id: 'rate-city-f11', modality: 'futbol_11', level: 'competitive', amount: 70000 };
    collection.find.mockReturnValue(toArrayResult([cityDoc, f11]));
    const repository = repositoryWith(collection);

    const found = await repository.findForDuration('zone-1', 'city-1', 60);

    expect(found.city).toEqual([
      expect.objectContaining({ modality: null, level: null, amount: 40000 }),
      expect.objectContaining({ modality: 'futbol_11', level: 'competitive', amount: 70000 }),
    ]);
  });

  it('returns only the level that exists', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([cityDoc]));
    const repository = repositoryWith(collection);

    const found = await repository.findForDuration('zone-1', 'city-1', 60);

    expect(found.zone).toEqual([]);
    expect(found.city.map((rate) => rate.amount)).toEqual([40000]);
  });

  it('returns empty lists when nothing is configured', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([]));
    const repository = repositoryWith(collection);

    expect(await repository.findForDuration('zone-1', 'city-1', 90)).toEqual({ zone: [], city: [] });
  });

  it('throws on a malformed rate instead of skipping it', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ ...zoneDoc, amount: 0 }]));
    const repository = repositoryWith(collection);

    await expect(repository.findForDuration('zone-1', 'city-1', 60)).rejects.toThrow(InvalidConfigurationError);
  });

  it('ensureIndexes replaces the old index with the unique per-tier one', async () => {
    const collection = createFakeCollection();
    collection.dropIndex.mockRejectedValue(Object.assign(new Error('index not found'), { code: 27 }));
    const repository = repositoryWith(collection);

    await repository.ensureIndexes();

    expect(collection.dropIndex).toHaveBeenCalledWith('scope_refId_durationMinutes');
    expect(collection.createIndex).toHaveBeenCalledWith(
      { scope: 1, refId: 1, durationMinutes: 1, modality: 1, level: 1 },
      { name: 'scope_refId_duration_modality_level', unique: true },
    );
  });
});

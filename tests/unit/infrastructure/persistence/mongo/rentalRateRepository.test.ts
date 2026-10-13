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

describe('RentalRateRepository.pricedDurations (admin readiness)', () => {
  it('reads which durations have a rate, for many cities and zones in one query', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ scope: 'city', refId: 'med', durationMinutes: 60 }, { scope: 'zone', refId: 'z1', durationMinutes: 90 }]));

    const priced = await repositoryWith(collection).pricedDurations({ cityIds: ['med'], zoneIds: ['z1', 'z2'] });

    expect(collection.find).toHaveBeenCalledWith(
      { $or: [{ scope: 'city', refId: { $in: ['med'] } }, { scope: 'zone', refId: { $in: ['z1', 'z2'] } }] },
      { projection: { scope: 1, refId: 1, durationMinutes: 1 } },
    );
    expect(priced).toEqual([
      { scope: 'city', refId: 'med', durationMinutes: 60 },
      { scope: 'zone', refId: 'z1', durationMinutes: 90 },
    ]);
  });

  it('asks nothing for no refs', async () => {
    const collection = createFakeCollection();
    expect(await repositoryWith(collection).pricedDurations({ cityIds: [], zoneIds: [] })).toEqual([]);
    expect(collection.find).not.toHaveBeenCalled();
  });
});

describe('RentalRateRepository — admin web (spec 004 of the admin)', () => {
  const stored = { _id: 'r1', scope: 'city', refId: 'city-1', durationMinutes: 90, amount: 55000, revision: 2 };

  it('finds the rates of the given refs, duration and modality', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([stored]));
    const repository = repositoryWith(collection);

    const found = await repository.find({
      refs: [
        { scope: 'city', refIds: ['city-1'] },
        { scope: 'zone', refIds: ['zone-1', 'zone-2'] },
      ],
      durationMinutes: 90,
      modality: 'futbol_11',
    });

    expect(collection.find).toHaveBeenCalledWith({
      $or: [
        { scope: 'city', refId: { $in: ['city-1'] } },
        { scope: 'zone', refId: { $in: ['zone-1', 'zone-2'] } },
      ],
      durationMinutes: 90,
      modality: 'futbol_11',
    });
    expect(found).toEqual([
      { id: 'r1', scope: 'city', refId: 'city-1', durationMinutes: 90, modality: null, level: null, amount: 55000, revision: 2, invalid: false },
    ]);
  });

  it('reads every rate without refs, and the general ones as modality null', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([]));
    await repositoryWith(collection).find({ refs: null, modality: 'general' });
    expect(collection.find).toHaveBeenCalledWith({ modality: null });
  });

  it('returns nothing for an empty list of refs, without reading', async () => {
    const collection = createFakeCollection();
    expect(await repositoryWith(collection).find({ refs: [{ scope: 'zone', refIds: [] }] })).toEqual([]);
    expect(collection.find).not.toHaveBeenCalled();
  });

  it('marks a seeded document the domain refuses instead of throwing', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ ...stored, amount: 55000.5, level: 'competitive' }]));
    const [record] = await repositoryWith(collection).find({ refs: null });
    expect(record).toMatchObject({ id: 'r1', amount: 55000.5, level: 'competitive', invalid: true });
  });

  it('reads one rate by id', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(stored);
    expect(await repositoryWith(collection).getById('r1')).toMatchObject({ id: 'r1', amount: 55000 });
    expect(collection.findOne).toHaveBeenCalledWith({ _id: 'r1' });
  });

  it('creates a rate with explicit nulls and revision 0', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({ acknowledged: true });
    const result = await repositoryWith(collection).create({
      id: 'r2', scope: 'zone', refId: 'zone-1', durationMinutes: 90, modality: null, level: null, amount: 60000,
    });
    expect(result).toEqual({ outcome: 'created' });
    expect(collection.insertOne).toHaveBeenCalledWith({
      _id: 'r2', scope: 'zone', refId: 'zone-1', durationMinutes: 90, modality: null, level: null, amount: 60000, revision: 0,
    });
  });

  it('answers duplicate with the existing id when the unique index refuses the rate', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));
    collection.findOne.mockResolvedValue({ _id: 'r1' });
    const result = await repositoryWith(collection).create({
      id: 'r2', scope: 'city', refId: 'city-1', durationMinutes: 90, modality: null, level: null, amount: 1,
    });
    expect(result).toEqual({ outcome: 'duplicate', existingId: 'r1' });
    expect(collection.findOne).toHaveBeenCalledWith({ scope: 'city', refId: 'city-1', durationMinutes: 90, modality: null, level: null }, { projection: { _id: 1 } });
  });

  it('rethrows any other write error', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockRejectedValue(new Error('down'));
    await expect(
      repositoryWith(collection).create({ id: 'r2', scope: 'city', refId: 'c', durationMinutes: 60, modality: null, level: null, amount: 1 }),
    ).rejects.toThrow('down');
  });

  it('changes only the amount, at the revision read', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    expect(await repositoryWith(collection).updateAmount('r1', 2, 60000)).toBe('saved');
    expect(collection.updateOne).toHaveBeenCalledWith({ _id: 'r1', revision: 2 }, { $set: { amount: 60000 }, $inc: { revision: 1 } });
  });

  it('answers stale when the revision moved', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 0 });
    expect(await repositoryWith(collection).updateAmount('r1', 2, 60000)).toBe('stale');
  });

  it('deletes a rate', async () => {
    const collection = createFakeCollection();
    collection.deleteOne.mockResolvedValue({ deletedCount: 1 });
    expect(await repositoryWith(collection).delete('r1')).toBe(true);
  });
});

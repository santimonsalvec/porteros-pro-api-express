import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { InvalidConfigurationError } from '../../../../../src/domain/pricing/invalidConfigurationError.js';
import { BookingSettingsRepository } from '../../../../../src/infrastructure/persistence/mongo/bookingSettingsRepository.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new BookingSettingsRepository(db);
}

const surcharge = {
  currency: 'COP', // a leftover key from an earlier layout: must be ignored
  tiers: [
    { fromMinutes: 0, toMinutes: 60, amount: 10000 },
    { fromMinutes: 60, toMinutes: null, amount: 0 },
  ],
};
const countryDoc = {
  _id: 's-country',
  scope: 'country',
  refId: 'country-co',
  bookingWindowDays: 2,
  minNoticeMinutes: 30,
  leadTimeSurcharge: surcharge,
};
const cityDoc = { _id: 's-city', scope: 'market', refId: 'city-1', bookingWindowDays: 4 };

describe('BookingSettingsRepository (mocked driver)', () => {
  it('queries the city and country documents in a single find', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([]));
    const repository = repositoryWith(collection);

    await repository.findFor('city-1', 'country-co');

    expect(collection.find).toHaveBeenCalledTimes(1);
    expect(collection.find).toHaveBeenCalledWith({
      $or: [
        { scope: 'market', refId: 'city-1' },
        { scope: 'country', refId: 'country-co' },
      ],
    });
  });

  it('asks only for the city document when the country is unknown', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([]));
    const repository = repositoryWith(collection);

    await repository.findFor('city-1', null);

    expect(collection.find).toHaveBeenCalledWith({ $or: [{ scope: 'market', refId: 'city-1' }] });
  });

  it('splits the results into city and country, keeping absent settings null', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([countryDoc, cityDoc]));
    const repository = repositoryWith(collection);

    const found = await repository.findFor('city-1', 'country-co');

    expect(found.country?.bookingWindowDays).toBe(2);
    expect(found.country?.leadTimeSurcharge?.tiers).toHaveLength(2);
    expect(found.country?.leadTimeSurcharge).not.toHaveProperty('currency');
    expect(found.market?.bookingWindowDays).toBe(4);
    expect(found.market?.minNoticeMinutes).toBeNull();
    expect(found.market?.leadTimeSurcharge).toBeNull();
  });

  it('returns nulls when nothing is configured', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([]));
    const repository = repositoryWith(collection);

    expect(await repository.findFor('city-1', 'country-co')).toEqual({ market: null, country: null });
  });

  it('throws on a malformed document instead of skipping it', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ ...countryDoc, bookingWindowDays: 0 }]));
    const repository = repositoryWith(collection);

    await expect(repository.findFor('city-1', 'country-co')).rejects.toThrow(InvalidConfigurationError);
  });

  it('ensureIndexes creates the unique (scope, refId) index', async () => {
    const collection = createFakeCollection();
    const repository = repositoryWith(collection);

    await repository.ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ scope: 1, refId: 1 }, expect.objectContaining({ unique: true }));
  });

  it('maps the free-cancellation period, and reads it as null when the document has none', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ ...countryDoc, freeCancellationMinutes: 60 }, cityDoc]));

    const found = await repositoryWith(collection).findFor('city-1', 'country-co');

    expect(found.country?.freeCancellationMinutes).toBe(60);
    expect(found.market?.freeCancellationMinutes).toBeNull();
  });

  it('maps the travel margin, and reads it as null when the document has none', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ ...countryDoc, travelBufferMinutes: 30 }, cityDoc]));

    const found = await repositoryWith(collection).findFor('city-1', 'country-co');

    expect(found.country?.travelBufferMinutes).toBe(30);
    expect(found.market?.travelBufferMinutes).toBeNull();
  });

  it('maps the check-in window (feature 020)', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ ...countryDoc, checkInWindow: { opensMinutesBefore: 20 } }, cityDoc]));

    const found = await repositoryWith(collection).findFor('city-1', 'country-co');

    expect(found.country?.checkInWindow).toEqual({ opensMinutesBefore: 20 });
    expect(found.market?.checkInWindow).toBeNull();
  });

  it('maps the goalkeeper penalty values (feature 018)', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ ...countryDoc, goalkeeperPenalties: { lateNoticeMinutes: 60, weeklyLimit: 4 } }, cityDoc]));

    const found = await repositoryWith(collection).findFor('city-1', 'country-co');

    expect(found.country?.goalkeeperPenalties).toEqual({ lateNoticeMinutes: 60, weeklyLimit: 4 });
    expect(found.market?.goalkeeperPenalties).toBeNull();
  });
});

describe('BookingSettingsRepository.findMany (admin readiness)', () => {
  it('reads the rules of many cities and countries in one query', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ _id: 'bs-co', scope: 'country', refId: 'co', minNoticeMinutes: 60 }]));

    const found = await repositoryWith(collection).findMany({ marketIds: ['med', 'bog'], countryIds: ['co'] });

    expect(collection.find).toHaveBeenCalledWith({ $or: [{ scope: 'market', refId: { $in: ['med', 'bog'] } }, { scope: 'country', refId: { $in: ['co'] } }] });
    expect(found.map((settings) => [settings.scope, settings.refId, settings.minNoticeMinutes])).toEqual([['country', 'co', 60]]);
  });

  it('asks nothing for no refs', async () => {
    const collection = createFakeCollection();
    expect(await repositoryWith(collection).findMany({ marketIds: [], countryIds: [] })).toEqual([]);
    expect(collection.find).not.toHaveBeenCalled();
  });
});

describe('BookingSettingsRepository — admin web (spec 004 of the admin)', () => {
  const empty = {
    bookingWindowDays: null, minNoticeMinutes: null, leadTimeSurcharge: null, freeCancellationMinutes: null, travelBufferMinutes: null,
    goalkeeperPenalties: null, checkInWindow: null, noShowGraceMinutes: null, offerReminderIntervalMinutes: null, offerMaxReminders: null,
  };

  it('reads one level with every field, null where it sets none', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 's-med', scope: 'market', refId: 'med', travelBufferMinutes: 45, revision: 3 });
    expect(await repositoryWith(collection).getByScope('market', 'med')).toEqual({
      scope: 'market', refId: 'med', fields: { ...empty, travelBufferMinutes: 45 }, revision: 3, invalid: false,
    });
    expect(collection.findOne).toHaveBeenCalledWith({ scope: 'market', refId: 'med' });
  });

  it('marks a seeded level the domain refuses', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 's', scope: 'country', refId: 'co', bookingWindowDays: 0 });
    expect(await repositoryWith(collection).getByScope('country', 'co')).toMatchObject({ invalid: true, fields: { bookingWindowDays: 0 } });
  });

  it('is null for a level with no document', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);
    expect(await repositoryWith(collection).getByScope('country', 'co')).toBeNull();
  });

  it('creates a level with only its values and revision 0', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({});
    const result = await repositoryWith(collection).save('market', 'med', null, {
      ...empty, travelBufferMinutes: 45, checkInWindow: { opensMinutesBefore: 30, closesMinutesAfter: null },
    });
    expect(result).toBe('saved');
    expect(collection.insertOne).toHaveBeenCalledWith({
      _id: 'market:med', scope: 'market', refId: 'med', travelBufferMinutes: 45, checkInWindow: { opensMinutesBefore: 30 }, revision: 0,
    });
  });

  it('is stale when another level was created meanwhile', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));
    expect(await repositoryWith(collection).save('market', 'med', null, empty)).toBe('stale');
  });

  it('replaces the values at the revision read, removing the ones now empty', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    const result = await repositoryWith(collection).save('country', 'co', 2, { ...empty, bookingWindowDays: 7 });
    expect(result).toBe('saved');
    expect(collection.updateOne).toHaveBeenCalledWith(
      { scope: 'country', refId: 'co', revision: 2 },
      {
        $set: { bookingWindowDays: 7 },
        $unset: {
          minNoticeMinutes: '', leadTimeSurcharge: '', freeCancellationMinutes: '', travelBufferMinutes: '',
          goalkeeperPenalties: '', checkInWindow: '', noShowGraceMinutes: '', offerReminderIntervalMinutes: '', offerMaxReminders: '',
        },
        $inc: { revision: 1 },
      },
    );
  });

  it('is stale when the revision moved', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 0 });
    expect(await repositoryWith(collection).save('country', 'co', 0, { ...empty, bookingWindowDays: 7 })).toBe('stale');
    expect(collection.updateOne.mock.calls[0]?.[0]).toEqual({ scope: 'country', refId: 'co', $or: [{ revision: 0 }, { revision: { $exists: false } }] });
  });

  it('lists every city level', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ _id: 's', scope: 'market', refId: 'med', travelBufferMinutes: 45 }]));
    expect(await repositoryWith(collection).listMarketScoped()).toMatchObject([{ refId: 'med', fields: { travelBufferMinutes: 45 } }]);
    expect(collection.find).toHaveBeenCalledWith({ scope: 'market' });
  });
});

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
const cityDoc = { _id: 's-city', scope: 'city', refId: 'city-1', bookingWindowDays: 4 };

describe('BookingSettingsRepository (mocked driver)', () => {
  it('queries the city and country documents in a single find', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([]));
    const repository = repositoryWith(collection);

    await repository.findFor('city-1', 'country-co');

    expect(collection.find).toHaveBeenCalledTimes(1);
    expect(collection.find).toHaveBeenCalledWith({
      $or: [
        { scope: 'city', refId: 'city-1' },
        { scope: 'country', refId: 'country-co' },
      ],
    });
  });

  it('asks only for the city document when the country is unknown', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([]));
    const repository = repositoryWith(collection);

    await repository.findFor('city-1', null);

    expect(collection.find).toHaveBeenCalledWith({ $or: [{ scope: 'city', refId: 'city-1' }] });
  });

  it('splits the results into city and country, keeping absent settings null', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([countryDoc, cityDoc]));
    const repository = repositoryWith(collection);

    const found = await repository.findFor('city-1', 'country-co');

    expect(found.country?.bookingWindowDays).toBe(2);
    expect(found.country?.leadTimeSurcharge?.tiers).toHaveLength(2);
    expect(found.country?.leadTimeSurcharge).not.toHaveProperty('currency');
    expect(found.city?.bookingWindowDays).toBe(4);
    expect(found.city?.minNoticeMinutes).toBeNull();
    expect(found.city?.leadTimeSurcharge).toBeNull();
  });

  it('returns nulls when nothing is configured', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([]));
    const repository = repositoryWith(collection);

    expect(await repository.findFor('city-1', 'country-co')).toEqual({ city: null, country: null });
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
    expect(found.city?.freeCancellationMinutes).toBeNull();
  });

  it('maps the travel margin, and reads it as null when the document has none', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ ...countryDoc, travelBufferMinutes: 30 }, cityDoc]));

    const found = await repositoryWith(collection).findFor('city-1', 'country-co');

    expect(found.country?.travelBufferMinutes).toBe(30);
    expect(found.city?.travelBufferMinutes).toBeNull();
  });

  it('maps the check-in window (feature 020)', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ ...countryDoc, checkInWindow: { opensMinutesBefore: 20 } }, cityDoc]));

    const found = await repositoryWith(collection).findFor('city-1', 'country-co');

    expect(found.country?.checkInWindow).toEqual({ opensMinutesBefore: 20 });
    expect(found.city?.checkInWindow).toBeNull();
  });

  it('maps the goalkeeper penalty values (feature 018)', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ ...countryDoc, goalkeeperPenalties: { lateNoticeMinutes: 60, weeklyLimit: 4 } }, cityDoc]));

    const found = await repositoryWith(collection).findFor('city-1', 'country-co');

    expect(found.country?.goalkeeperPenalties).toEqual({ lateNoticeMinutes: 60, weeklyLimit: 4 });
    expect(found.city?.goalkeeperPenalties).toBeNull();
  });
});

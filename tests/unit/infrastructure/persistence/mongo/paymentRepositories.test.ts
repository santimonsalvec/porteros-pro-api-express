import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { PaymentGatewaySettings } from '../../../../../src/domain/payments/gatewaySettings.js';
import { TopUp } from '../../../../../src/domain/payments/topUp.js';
import { InvalidConfigurationError } from '../../../../../src/domain/pricing/invalidConfigurationError.js';
import { PaymentGatewaySettingsRepository } from '../../../../../src/infrastructure/persistence/mongo/paymentGatewaySettingsRepository.js';
import { TopUpRepository, topUpToDocument } from '../../../../../src/infrastructure/persistence/mongo/topUpRepository.js';
import { createFakeCollection, toArrayCursor } from '../../../../fakes/fakeMongoCollection.js';

const NOW = new Date('2026-09-29T12:00:00.000Z');

function dbWith(collection: ReturnType<typeof createFakeCollection>): Db {
  return { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
}

const settingsDoc = {
  _id: 'country-co',
  gateway: 'wompi',
  publicConfig: { publicKey: 'pub_test_abc', environment: 'sandbox' },
  currency: 'COP',
  costs: { percentBps: 265, fixed: 700, vatBps: 1900 },
  amounts: [10000, 20000],
  updatedAt: NOW,
  updatedBy: 'admin-1',
};

const topUp = TopUp.start({
  id: '0192-abcd',
  goalkeeperId: 'gk-1',
  countryId: 'country-co',
  gateway: 'wompi',
  environment: 'sandbox',
  amount: 20000,
  cost: 1464,
  currency: 'COP',
  now: NOW,
});

describe('PaymentGatewaySettingsRepository (mocked driver)', () => {
  it('reads a country\'s settings by its id', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(settingsDoc);

    const settings = await new PaymentGatewaySettingsRepository(dbWith(collection)).getByCountry('country-co');

    expect(collection.findOne).toHaveBeenCalledWith({ _id: 'country-co' });
    expect(settings?.options()[0]).toEqual({ amount: 10000, cost: 1149, net: 8851 });
  });

  it('raises a configuration error for a malformed document', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ ...settingsDoc, gateway: 'stripe' });

    await expect(new PaymentGatewaySettingsRepository(dbWith(collection)).getByCountry('country-co')).rejects.toBeInstanceOf(
      InvalidConfigurationError,
    );
  });

  it('replaces the country\'s document, creating it when missing', async () => {
    const collection = createFakeCollection();
    collection.replaceOne.mockResolvedValue({});
    const created = PaymentGatewaySettings.create({ ...settingsDoc, countryId: 'country-co' } as never);
    if (!created.ok) throw new Error('invalid');

    await new PaymentGatewaySettingsRepository(dbWith(collection)).save(created.settings);

    expect(collection.replaceOne).toHaveBeenCalledWith({ _id: 'country-co' }, settingsDoc, { upsert: true });
  });
});

describe('TopUpRepository (mocked driver)', () => {
  it('creates its three indexes', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');

    await new TopUpRepository(dbWith(collection)).ensureIndexes();

    expect(collection.createIndex.mock.calls).toEqual([
      [{ reference: 1 }, { name: 'reference_unique', unique: true }],
      [{ goalkeeperId: 1, createdAt: -1, _id: -1 }, { name: 'goalkeeper_created' }],
      [{ status: 1, nextCheckAt: 1 }, { name: 'status_nextCheck' }],
    ]);
  });

  it('stores and reads a top-up back unchanged', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({});
    const repository = new TopUpRepository(dbWith(collection));

    await repository.create(topUp);
    const doc = collection.insertOne.mock.calls[0]![0] as Document;
    collection.findOne.mockResolvedValue(doc);

    expect(doc).toMatchObject({ _id: '0192-abcd', reference: 'PPR-0192abcd', status: 'pending', net: 18536 });
    expect((await repository.getByReference('PPR-0192abcd'))?.toProps()).toEqual(topUp.toProps());
    expect(collection.findOne).toHaveBeenLastCalledWith({ reference: 'PPR-0192abcd' });
  });

  it('lists a goalkeeper\'s top-ups newest first', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([topUpToDocument(topUp)]);
    collection.find.mockReturnValue(cursor);

    const items = await new TopUpRepository(dbWith(collection)).listForGoalkeeper('gk-1', 20, 10);

    expect(collection.find).toHaveBeenCalledWith({ goalkeeperId: 'gk-1' });
    expect(cursor.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(cursor.skip).toHaveBeenCalledWith(20);
    expect(cursor.limit).toHaveBeenCalledWith(10);
    expect(items).toHaveLength(1);
  });

  it('finds pending top-ups whose check is due, oldest first, capped', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([]);
    collection.find.mockReturnValue(cursor);

    await new TopUpRepository(dbWith(collection)).findDueForCheck(NOW, 50);

    expect(collection.find).toHaveBeenCalledWith({ status: 'pending', nextCheckAt: { $lte: NOW } });
    expect(cursor.sort).toHaveBeenCalledWith({ nextCheckAt: 1 });
    expect(cursor.limit).toHaveBeenCalledWith(50);
  });

  it('schedules the next check only while pending', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({});
    const next = new Date(NOW.getTime() + 3_600_000);

    await new TopUpRepository(dbWith(collection)).scheduleNextCheck('0192-abcd', next, NOW);

    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: '0192-abcd', status: 'pending' },
      { $set: { nextCheckAt: next, lastCheckedAt: NOW }, $inc: { checks: 1 } },
    );
  });
});

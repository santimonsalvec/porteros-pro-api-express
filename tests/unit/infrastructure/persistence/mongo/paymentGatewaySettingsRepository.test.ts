import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { PaymentGatewaySettings } from '../../../../../src/domain/payments/gatewaySettings.js';
import { PaymentGatewaySettingsRepository } from '../../../../../src/infrastructure/persistence/mongo/paymentGatewaySettingsRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

// Admin spec 007, US4 (FR-025, research §8): every save names the revision it read.

const settings = PaymentGatewaySettings.rehydrate({
  countryId: 'country-co',
  gateway: 'wompi',
  publicConfig: { publicKey: 'pub_test_x', environment: 'sandbox' },
  currency: 'COP',
  costs: { percentBps: 265, fixed: 700, vatBps: 1900 },
  amounts: [20000],
  updatedAt: new Date('2026-10-13T00:00:00.000Z'),
  updatedBy: 'admin-1',
});

const fields = {
  gateway: 'wompi',
  publicConfig: { publicKey: 'pub_test_x', environment: 'sandbox' },
  currency: 'COP',
  costs: { percentBps: 265, fixed: 700, vatBps: 1900 },
  amounts: [20000],
  updatedAt: new Date('2026-10-13T00:00:00.000Z'),
  updatedBy: 'admin-1',
};

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  return new PaymentGatewaySettingsRepository({ collection: () => collection as unknown as Collection<Document> } as unknown as Db);
}

describe('PaymentGatewaySettingsRepository revision (mocked driver)', () => {
  it('creates a country at revision 0', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({});

    expect(await repositoryWith(collection).create(settings)).toBe('saved');
    expect(collection.insertOne).toHaveBeenCalledWith({ _id: 'country-co', ...fields, revision: 0 });
  });

  it('answers stale when the country already has settings', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));

    expect(await repositoryWith(collection).create(settings)).toBe('stale');
  });

  it('updates only at the revision read, and moves it up one', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValueOnce({ matchedCount: 1 }).mockResolvedValueOnce({ matchedCount: 0 });
    const repository = repositoryWith(collection);

    expect(await repository.update(settings, 3)).toBe('saved');
    expect(collection.updateOne).toHaveBeenCalledWith({ _id: 'country-co', revision: 3 }, { $set: fields, $inc: { revision: 1 } });
    expect(await repository.update(settings, 3)).toBe('stale');
  });

  it('treats a document without revision as revision 0', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });

    await repositoryWith(collection).update(settings, 0);

    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: 'country-co', $or: [{ revision: 0 }, { revision: { $exists: false } }] },
      { $set: fields, $inc: { revision: 1 } },
    );
  });

  it('reads the revision back', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 'country-co', ...fields, revision: 2 });
    expect((await repositoryWith(collection).getByCountry('country-co'))?.revision).toBe(2);
  });
});

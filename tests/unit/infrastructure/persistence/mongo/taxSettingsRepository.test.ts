import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { TaxSetting } from '../../../../../src/domain/wallet/taxSetting.js';
import { TaxSettingsRepository } from '../../../../../src/infrastructure/persistence/mongo/taxSettingsRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

const NOW = new Date('2026-09-29T12:00:00.000Z');

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  return new TaxSettingsRepository({ collection: () => collection as unknown as Collection<Document> } as unknown as Db);
}

describe('TaxSettingsRepository (mocked driver)', () => {
  it('reads a country\'s rate', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 'country-co', vatRateBps: 1900, updatedAt: NOW, updatedBy: 'admin-1' });

    expect((await repositoryWith(collection).getByCountry('country-co'))?.vatRateBps).toBe(1900);
    expect(collection.findOne).toHaveBeenCalledWith({ _id: 'country-co' });
  });

  it('replaces the country\'s document', async () => {
    const collection = createFakeCollection();
    collection.replaceOne.mockResolvedValue({});
    const setting = TaxSetting.rehydrate({ countryId: 'country-co', vatRateBps: 1900, updatedAt: NOW, updatedBy: 'admin-1' });

    await repositoryWith(collection).save(setting);

    expect(collection.replaceOne).toHaveBeenCalledWith(
      { _id: 'country-co' },
      { _id: 'country-co', vatRateBps: 1900, updatedAt: NOW, updatedBy: 'admin-1' },
      { upsert: true },
    );
  });
});

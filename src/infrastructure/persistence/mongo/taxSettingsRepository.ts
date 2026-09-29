import type { Collection, Db, Document } from 'mongodb';
import type { ITaxSettingsRepository } from '../../../application/features/wallet/common/ports.js';
import { TaxSetting } from '../../../domain/wallet/taxSetting.js';

export const TAX_SETTINGS_COLLECTION = 'taxSettings';

/** Each country's VAT rate (feature 023), one document per country (`_id` = countryId). */
export class TaxSettingsRepository implements ITaxSettingsRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(TAX_SETTINGS_COLLECTION);
  }

  async getByCountry(countryId: string): Promise<TaxSetting | null> {
    const doc = await this.collection.findOne({ _id: countryId } as Document);
    return doc
      ? TaxSetting.rehydrate({
          countryId: String(doc._id),
          vatRateBps: doc.vatRateBps as number,
          updatedAt: new Date(doc.updatedAt as Date),
          updatedBy: doc.updatedBy as string,
        })
      : null;
  }

  async save(setting: TaxSetting): Promise<void> {
    await this.collection.replaceOne(
      { _id: setting.countryId } as Document,
      { _id: setting.countryId, vatRateBps: setting.vatRateBps, updatedAt: setting.updatedAt, updatedBy: setting.updatedBy },
      { upsert: true },
    );
  }
}

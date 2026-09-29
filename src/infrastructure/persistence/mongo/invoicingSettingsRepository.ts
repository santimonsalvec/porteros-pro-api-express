import type { Collection, Db, Document } from 'mongodb';
import type { IInvoicingSettingsRepository } from '../../../application/features/invoicing/common/ports.js';
import { InvoicingSettings, type InvoicingProviderName } from '../../../domain/invoicing/invoicingSettings.js';

export const INVOICING_SETTINGS_COLLECTION = 'invoicingSettings';

/** Each country's invoicing provider (feature 023), one document per country (`_id` = countryId). No secrets. */
export class InvoicingSettingsRepository implements IInvoicingSettingsRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(INVOICING_SETTINGS_COLLECTION);
  }

  async getByCountry(countryId: string): Promise<InvoicingSettings | null> {
    const doc = await this.collection.findOne({ _id: countryId } as Document);
    return doc
      ? InvoicingSettings.rehydrate({
          countryId: String(doc._id),
          provider: doc.provider as InvoicingProviderName,
          config: (doc.config as Record<string, unknown> | undefined) ?? {},
          updatedAt: new Date(doc.updatedAt as Date),
          updatedBy: doc.updatedBy as string,
        })
      : null;
  }

  async save(settings: InvoicingSettings): Promise<void> {
    await this.collection.replaceOne(
      { _id: settings.countryId } as Document,
      { _id: settings.countryId, provider: settings.provider, config: { ...settings.config }, updatedAt: settings.updatedAt, updatedBy: settings.updatedBy },
      { upsert: true },
    );
  }
}

import type { Collection, Db, Document } from 'mongodb';
import type { UpdateResult } from '../../../application/features/geography/common/ports.js';
import type { IInvoicingSettingsRepository } from '../../../application/features/invoicing/common/ports.js';
import { InvoicingSettings, type InvoicingProviderName } from '../../../domain/invoicing/invoicingSettings.js';

export const INVOICING_SETTINGS_COLLECTION = 'invoicingSettings';

const DUPLICATE_KEY = 11000;

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
          revision: (doc.revision as number | undefined) ?? 0,
        })
      : null;
  }

  /** A country's first provider, at revision 0; `stale` when it already has one (admin spec 007, FR-025). */
  async create(settings: InvoicingSettings): Promise<UpdateResult> {
    try {
      await this.collection.insertOne({ _id: settings.countryId, ...fieldsOf(settings), revision: 0 } as Document);
      return 'saved';
    } catch (error) {
      if ((error as { code?: unknown }).code === DUPLICATE_KEY) return 'stale';
      throw error;
    }
  }

  /** Writes only if the settings are still at `expectedRevision`, and moves it up one. */
  async update(settings: InvoicingSettings, expectedRevision: number): Promise<UpdateResult> {
    const atRevision = expectedRevision === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision: expectedRevision };
    const result = await this.collection.updateOne({ _id: settings.countryId, ...atRevision } as Document, { $set: fieldsOf(settings), $inc: { revision: 1 } });
    return result.matchedCount > 0 ? 'saved' : 'stale';
  }
}

function fieldsOf(settings: InvoicingSettings): Document {
  return { provider: settings.provider, config: { ...settings.config }, updatedAt: settings.updatedAt, updatedBy: settings.updatedBy };
}

import type { Collection, Db, Document } from 'mongodb';
import type { UpdateResult } from '../../../application/features/geography/common/ports.js';
import type { IPaymentGatewaySettingsRepository } from '../../../application/features/payments/common/ports.js';
import {
  PaymentGatewaySettings,
  type GatewayCosts,
  type GatewayName,
  type GatewayPublicConfig,
  type GatewayScope,
} from '../../../domain/payments/gatewaySettings.js';

export const PAYMENT_GATEWAY_SETTINGS_COLLECTION = 'paymentGatewaySettings';

export function gatewaySettingsToDocument(settings: PaymentGatewaySettings): Document {
  return {
    _id: settings.id,
    scope: settings.scope,
    refId: settings.refId,
    countryId: settings.countryId,
    gateway: settings.gateway,
    publicConfig: settings.publicConfig,
    currency: settings.currency,
    costs: settings.costs,
    amounts: settings.amounts,
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
  };
}

const DUPLICATE_KEY = 11000;

export function gatewaySettingsFromDocument(doc: Document): PaymentGatewaySettings {
  // A document from before spec 031 is a country's, keyed by its id.
  const legacy = doc.scope === undefined;
  return PaymentGatewaySettings.rehydrate({
    countryId: legacy ? String(doc._id) : (doc.countryId as string),
    scope: legacy ? 'country' : (doc.scope as GatewayScope),
    refId: legacy ? String(doc._id) : (doc.refId as string),
    gateway: doc.gateway as GatewayName,
    publicConfig: doc.publicConfig as GatewayPublicConfig,
    currency: doc.currency as string,
    costs: doc.costs as GatewayCosts,
    amounts: doc.amounts as number[],
    updatedAt: new Date(doc.updatedAt as Date),
    updatedBy: doc.updatedBy as string,
    revision: (doc.revision as number | undefined) ?? 0,
  });
}

/**
 * Each country's deposit gateway (feature 022), and each market's override (spec 031): one document
 * per `scope` + `refId`. No secrets.
 */
export class PaymentGatewaySettingsRepository implements IPaymentGatewaySettingsRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(PAYMENT_GATEWAY_SETTINGS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ scope: 1, refId: 1 }, { name: 'scope_ref_unique', unique: true, partialFilterExpression: { scope: { $exists: true } } });
    await this.collection.createIndex({ countryId: 1 }, { name: 'country' });
  }

  getByCountry(countryId: string): Promise<PaymentGatewaySettings | null> {
    return this.getFor('country', countryId);
  }

  async getFor(scope: GatewayScope, refId: string): Promise<PaymentGatewaySettings | null> {
    const legacy = scope === 'country' ? [{ _id: refId, scope: { $exists: false } }] : [];
    const doc = await this.collection.findOne({ $or: [{ scope, refId }, ...legacy] } as Document);
    return doc ? gatewaySettingsFromDocument(doc) : null;
  }

  async listForCountry(countryId: string): Promise<PaymentGatewaySettings[]> {
    const docs = await this.collection.find({ $or: [{ countryId }, { _id: countryId, scope: { $exists: false } }] } as Document).toArray();
    return docs.map(gatewaySettingsFromDocument);
  }

  async deleteMarketOverride(marketId: string): Promise<'deleted' | 'not_found'> {
    const result = await this.collection.deleteOne({ scope: 'market', refId: marketId });
    return result.deletedCount > 0 ? 'deleted' : 'not_found';
  }

  /** A country's first settings, at revision 0; `stale` when it already has some (admin spec 007, FR-025). */
  async create(settings: PaymentGatewaySettings): Promise<UpdateResult> {
    try {
      await this.collection.insertOne({ ...gatewaySettingsToDocument(settings), revision: 0 });
      return 'saved';
    } catch (error) {
      if ((error as { code?: unknown }).code === DUPLICATE_KEY) return 'stale';
      throw error;
    }
  }

  /** Writes only if the settings are still at `expectedRevision`, and moves it up one. */
  async update(settings: PaymentGatewaySettings, expectedRevision: number): Promise<UpdateResult> {
    // By scope and reference, never `_id`: the development reset gives converted documents new ids.
    const fields = gatewaySettingsToDocument(settings);
    delete fields._id;
    const atRevision = expectedRevision === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision: expectedRevision };
    const result = await this.collection.updateOne({ scope: settings.scope, refId: settings.refId, ...atRevision } as Document, { $set: fields, $inc: { revision: 1 } });
    return result.matchedCount > 0 ? 'saved' : 'stale';
  }
}

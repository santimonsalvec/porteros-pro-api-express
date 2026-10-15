import type { Collection, Db, Document } from 'mongodb';
import type { UpdateResult } from '../../../application/features/geography/common/ports.js';
import type { IPaymentGatewaySettingsRepository } from '../../../application/features/payments/common/ports.js';
import {
  PaymentGatewaySettings,
  type GatewayCosts,
  type GatewayName,
  type GatewayPublicConfig,
} from '../../../domain/payments/gatewaySettings.js';

export const PAYMENT_GATEWAY_SETTINGS_COLLECTION = 'paymentGatewaySettings';

export function gatewaySettingsToDocument(settings: PaymentGatewaySettings): Document {
  return {
    _id: settings.countryId,
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
  return PaymentGatewaySettings.rehydrate({
    countryId: String(doc._id),
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

/** Each country's deposit gateway (feature 022), one document per country (`_id` = countryId). No secrets. */
export class PaymentGatewaySettingsRepository implements IPaymentGatewaySettingsRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(PAYMENT_GATEWAY_SETTINGS_COLLECTION);
  }

  async getByCountry(countryId: string): Promise<PaymentGatewaySettings | null> {
    const doc = await this.collection.findOne({ _id: countryId } as Document);
    return doc ? gatewaySettingsFromDocument(doc) : null;
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
    const { _id, ...fields } = gatewaySettingsToDocument(settings);
    const atRevision = expectedRevision === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision: expectedRevision };
    const result = await this.collection.updateOne({ _id, ...atRevision } as Document, { $set: fields, $inc: { revision: 1 } });
    return result.matchedCount > 0 ? 'saved' : 'stale';
  }
}

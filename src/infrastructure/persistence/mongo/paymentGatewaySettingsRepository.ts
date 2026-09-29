import type { Collection, Db, Document } from 'mongodb';
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
  });
}

/** Each country's top-up gateway (feature 022), one document per country (`_id` = countryId). No secrets. */
export class PaymentGatewaySettingsRepository implements IPaymentGatewaySettingsRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(PAYMENT_GATEWAY_SETTINGS_COLLECTION);
  }

  async getByCountry(countryId: string): Promise<PaymentGatewaySettings | null> {
    const doc = await this.collection.findOne({ _id: countryId } as Document);
    return doc ? gatewaySettingsFromDocument(doc) : null;
  }

  async save(settings: PaymentGatewaySettings): Promise<void> {
    await this.collection.replaceOne({ _id: settings.countryId } as Document, gatewaySettingsToDocument(settings), { upsert: true });
  }
}

import type { IPaymentGatewaySettingsRepository } from '../../src/application/features/payments/common/ports.js';
import { PaymentGatewaySettings, type PaymentGatewaySettingsProps } from '../../src/domain/payments/gatewaySettings.js';

export const COLOMBIA_GATEWAY_SETTINGS: PaymentGatewaySettingsProps = {
  countryId: 'country-co',
  gateway: 'wompi',
  publicConfig: { publicKey: 'pub_test_fake-public-key', environment: 'sandbox' },
  currency: 'COP',
  costs: { percentBps: 265, fixed: 700, vatBps: 1900 },
  amounts: [10000, 20000, 30000, 50000, 100000],
  updatedAt: new Date('2026-09-28T00:00:00.000Z'),
  updatedBy: 'admin-seed',
};

export class FakePaymentGatewaySettingsRepository implements IPaymentGatewaySettingsRepository {
  private readonly state = new Map<string, PaymentGatewaySettings>();

  /** Colombia's Wompi settings by default (20 000 costs 1 464, net 18 536). */
  seed(props: Partial<PaymentGatewaySettingsProps> = {}): PaymentGatewaySettings {
    const settings = PaymentGatewaySettings.rehydrate({ ...COLOMBIA_GATEWAY_SETTINGS, ...props });
    this.state.set(settings.countryId, settings);
    return settings;
  }

  clear(): void {
    this.state.clear();
  }

  async getByCountry(countryId: string): Promise<PaymentGatewaySettings | null> {
    return this.state.get(countryId) ?? null;
  }

  async save(settings: PaymentGatewaySettings): Promise<void> {
    this.state.set(settings.countryId, settings);
  }
}

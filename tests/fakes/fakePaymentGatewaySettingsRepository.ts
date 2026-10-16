import type { IPaymentGatewaySettingsRepository } from '../../src/application/features/payments/common/ports.js';
import { PaymentGatewaySettings, type GatewayScope, type PaymentGatewaySettingsProps } from '../../src/domain/payments/gatewaySettings.js';

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
    this.state.set(settings.id, settings);
    return settings;
  }

  clear(): void {
    this.state.clear();
  }

  async getByCountry(countryId: string): Promise<PaymentGatewaySettings | null> {
    return this.getFor('country', countryId);
  }

  async getFor(scope: GatewayScope, refId: string): Promise<PaymentGatewaySettings | null> {
    return this.state.get(`${scope}:${refId}`) ?? null;
  }

  async listForCountry(countryId: string): Promise<PaymentGatewaySettings[]> {
    return [...this.state.values()].filter((settings) => settings.countryId === countryId);
  }

  async deleteMarketOverride(marketId: string): Promise<'deleted' | 'not_found'> {
    return this.state.delete(`market:${marketId}`) ? 'deleted' : 'not_found';
  }

  async create(settings: PaymentGatewaySettings): Promise<'saved' | 'stale'> {
    if (this.state.has(settings.id)) return 'stale';
    this.state.set(settings.id, PaymentGatewaySettings.rehydrate({ ...this.propsOf(settings), revision: 0 }));
    return 'saved';
  }

  async update(settings: PaymentGatewaySettings, expectedRevision: number): Promise<'saved' | 'stale'> {
    const current = this.state.get(settings.id);
    if (!current || current.revision !== expectedRevision) return 'stale';
    this.state.set(settings.id, PaymentGatewaySettings.rehydrate({ ...this.propsOf(settings), revision: expectedRevision + 1 }));
    return 'saved';
  }

  private propsOf(settings: PaymentGatewaySettings): PaymentGatewaySettingsProps {
    return {
      countryId: settings.countryId,
      scope: settings.scope,
      refId: settings.refId,
      gateway: settings.gateway,
      publicConfig: settings.publicConfig,
      currency: settings.currency,
      costs: settings.costs,
      amounts: settings.amounts,
      updatedAt: settings.updatedAt,
      updatedBy: settings.updatedBy,
    };
  }
}

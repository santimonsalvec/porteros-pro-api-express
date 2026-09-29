import type { PaymentGatewaySettings, TopUpOption } from '../../../../domain/payments/gatewaySettings.js';

/** A country's gateway settings as administrators see them (contracts §7). Never a secret. */
export interface GatewaySettingsResponse {
  countryId: string;
  gateway: string;
  publicConfig: { publicKey: string; environment: string };
  currency: string;
  costs: { percentBps: number; fixed: number; vatBps: number };
  amounts: number[];
  options: TopUpOption[];
  updatedAt: string;
  updatedBy: string;
}

export function toGatewaySettingsResponse(settings: PaymentGatewaySettings): GatewaySettingsResponse {
  return {
    countryId: settings.countryId,
    gateway: settings.gateway,
    publicConfig: { ...settings.publicConfig },
    currency: settings.currency,
    costs: { ...settings.costs },
    amounts: [...settings.amounts],
    options: settings.options(),
    updatedAt: settings.updatedAt.toISOString(),
    updatedBy: settings.updatedBy,
  };
}

import type { PaymentGatewaySettings, TopUpOption } from '../../../../domain/payments/gatewaySettings.js';
import type { ICountryLookup } from '../../goalkeeperRequests/common/ports.js';
import type { IPaymentSecrets } from './ports.js';

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
  /** What the next save must send (admin spec 007, FR-025). */
  revision: number;
  /** Whether the country's secrets are in Secret Manager; never their values (FR-012). */
  credentialsPresent: boolean;
}

export function toGatewaySettingsResponse(settings: PaymentGatewaySettings, credentialsPresent: boolean): GatewaySettingsResponse {
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
    revision: settings.revision,
    credentialsPresent,
  };
}

/** Whether a country's gateway secrets are loaded (feature 022's secrets, read the same way). */
export async function gatewayCredentialsPresent(
  deps: { secrets: IPaymentSecrets; countryLookup: ICountryLookup },
  settings: PaymentGatewaySettings,
): Promise<boolean> {
  const country = await deps.countryLookup.getById(settings.countryId);
  return country ? deps.secrets.forGateway(settings.gateway, country.countryCode) !== null : false;
}

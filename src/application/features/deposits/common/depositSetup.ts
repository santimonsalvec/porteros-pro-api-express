import type { PaymentGatewaySettings } from '../../../../domain/payments/gatewaySettings.js';
import type { ITermsAcceptanceRepository } from '../../profile/common/ports.js';
import type { IPaymentGatewaySettingsRepository } from '../../payments/common/ports.js';

/** Whether the user's latest acceptance is of the current terms (research.md §10). */
export async function acceptedCurrentTerms(
  terms: ITermsAcceptanceRepository,
  userId: string,
  termsVersion: string,
): Promise<boolean> {
  const latest = await terms.findLatestForUser(userId);
  return latest?.termsVersion === termsVersion;
}

/**
 * The deposit settings of the goalkeeper's market (spec 031, FR-032): its override, else its
 * country's; only when they are in the operating balance's currency (a operating balance has one
 * currency, so any other would be a configuration gap).
 */
export async function usableSettings(
  settingsRepository: IPaymentGatewaySettingsRepository,
  where: { countryId: string; marketId: string },
  operatingBalanceCurrency: string,
): Promise<PaymentGatewaySettings | null> {
  const settings = (await settingsRepository.getFor('market', where.marketId)) ?? (await settingsRepository.getByCountry(where.countryId));
  return settings && settings.currency === operatingBalanceCurrency ? settings : null;
}

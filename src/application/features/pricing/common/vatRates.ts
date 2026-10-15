import type { ITaxSettingsRepository } from '../../operatingBalance/common/ports.js';

/** Each country's VAT rate in basis points, 0 where none is configured (business-settings §10). */
export async function vatRatesOf(taxSettings: ITaxSettingsRepository, countryIds: readonly (string | null)[]): Promise<Map<string, number>> {
  const ids = [...new Set(countryIds.filter((id): id is string => id !== null))];
  const settings = await Promise.all(ids.map((id) => taxSettings.getByCountry(id)));
  return new Map(ids.map((id, index) => [id, settings[index]?.vatRateBps ?? 0]));
}

import type { IGoalkeeperProfileRepository } from '../../goalkeepers/common/ports.js';
import type { IAdminMarketRepository } from '../../markets/common/ports.js';
import type { IAdminCountryRepository } from '../../geography/common/ports.js';
import { isValidTimeZone, resolveLocalDateTime } from '../../goalkeeperRequests/common/zonedTime.js';
import { parseStartsAt } from '../../goalkeeperRequests/common/startsAt.js';
import type { TargetFailure } from './pricingGeography.js';

export interface GoalkeeperTargetDependencies {
  goalkeeperProfiles: Pick<IGoalkeeperProfileRepository, 'getByUserId'>;
  markets: Pick<IAdminMarketRepository, 'getById'>;
  countries: Pick<IAdminCountryRepository, 'getById'>;
}

export type GoalkeeperTarget =
  | { outcome: 'ok'; countryId: string; currency: string; marketId: string; timeZone: string; validUntil: Date | null }
  | { outcome: 'goalkeeper_not_found' }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> }
  | TargetFailure;

/**
 * Where a goalkeeper rule hangs (feature 033): the goalkeeper's market and its country (the rule is
 * bound to it, FR-010), and the expiry typed in that market's time zone, refused when in the past.
 */
export async function resolveGoalkeeperTarget(
  deps: GoalkeeperTargetDependencies,
  goalkeeperId: string,
  validUntilLocal: string | null,
  now: Date,
): Promise<GoalkeeperTarget> {
  const profile = await deps.goalkeeperProfiles.getByUserId(goalkeeperId);
  if (!profile) return { outcome: 'goalkeeper_not_found' };
  const market = await deps.markets.getById(profile.marketId);
  if (!market) return { outcome: 'market_not_found' };
  const country = await deps.countries.getById(market.countryId);
  if (!country?.currency) return { outcome: 'country_without_currency' };
  const timeZone = isValidTimeZone(market.timeZone) ? market.timeZone : 'UTC';

  let validUntil: Date | null = null;
  if (validUntilLocal !== null) {
    const parsed = parseStartsAt(`${validUntilLocal}:00`);
    const resolved = parsed ? resolveLocalDateTime(parsed.local, timeZone) : null;
    if (!resolved || resolved.kind !== 'ok') return { outcome: 'invalid', fieldErrors: { validUntilLocal: 'nonexistent_local_time' } };
    if (resolved.epochMs <= now.getTime()) return { outcome: 'invalid', fieldErrors: { validUntilLocal: 'past' } };
    validUntil = new Date(resolved.epochMs);
  }
  return { outcome: 'ok', countryId: country.id, currency: country.currency, marketId: market.id, timeZone, validUntil };
}

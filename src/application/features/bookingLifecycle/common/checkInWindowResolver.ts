import { CHECK_IN_DEFAULTS, type CheckInWindowConfig } from '../../../../domain/bookings/checkInWindow.js';
import type { GoalkeeperRequest } from '../../../../domain/bookings/goalkeeperRequest.js';
import { resolveLayered } from '../../../../domain/settings/layered.js';
import { createCountrySettingsResolver, type CountrySettingsResolverDependencies } from './countrySettingsResolver.js';
import type { ILifecycleLogger } from './ports.js';

export interface CheckInWindowResolverDependencies extends CountrySettingsResolverDependencies {
  logger: ILifecycleLogger;
}

export type CheckInWindowResolver = (request: GoalkeeperRequest) => Promise<CheckInWindowConfig>;

const FIELDS = ['opensMinutesBefore', 'closesMinutesAfter'] as const;

/**
 * The check-in window values of the match's market (feature 020; spec 031, FR-014): each value
 * from the market, else the country, else the platform default, with a warning naming what was
 * defaulted. Never fails. Cached per market for the resolver's lifetime.
 */
export function createCheckInWindowResolver(deps: CheckInWindowResolverDependencies): CheckInWindowResolver {
  const country = createCountrySettingsResolver(deps);
  return async (request) => {
    const marketId = request.match.marketId;
    const { countryId, settings, marketSettings } = await country(marketId);
    const config: CheckInWindowConfig = { ...CHECK_IN_DEFAULTS };
    const defaulted: string[] = [];
    for (const field of FIELDS) {
      const { value, origin } = resolveLayered(
        { market: marketSettings?.checkInWindow?.[field], country: settings?.checkInWindow?.[field] },
        CHECK_IN_DEFAULTS[field],
      );
      if (origin === 'platform') defaulted.push(field);
      config[field] = value ?? CHECK_IN_DEFAULTS[field];
    }
    if (defaulted.length > 0) {
      deps.logger.warn({ outcome: 'check_in_window_defaulted', marketId, countryId, defaulted }, 'Check-in window values missing for the market and its country; using the defaults');
    }
    return config;
  };
}

/** Minutes after the end before a no-show, by default (feature 021). */
export const NO_SHOW_GRACE_DEFAULT_MINUTES = 60;

/** The no-show grace period of the match's market, else its country (feature 021; spec 031), default 60 with a warning. */
export function createNoShowGraceResolver(deps: CheckInWindowResolverDependencies): (request: GoalkeeperRequest) => Promise<number> {
  const country = createCountrySettingsResolver(deps);
  return async (request) => {
    const marketId = request.match.marketId;
    const { countryId, settings, marketSettings } = await country(marketId);
    const { value, origin } = resolveLayered({ market: marketSettings?.noShowGraceMinutes, country: settings?.noShowGraceMinutes }, NO_SHOW_GRACE_DEFAULT_MINUTES);
    if (origin === 'platform') {
      deps.logger.warn({ outcome: 'no_show_grace_defaulted', marketId, countryId }, 'No-show grace period missing for the market and its country; using the default');
    }
    return value ?? NO_SHOW_GRACE_DEFAULT_MINUTES;
  };
}

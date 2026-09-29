import { CHECK_IN_DEFAULTS, type CheckInWindowConfig } from '../../../../domain/bookings/checkInWindow.js';
import type { GoalkeeperRequest } from '../../../../domain/bookings/goalkeeperRequest.js';
import { createCountrySettingsResolver, type CountrySettingsResolverDependencies } from './countrySettingsResolver.js';
import type { ILifecycleLogger } from './ports.js';

export interface CheckInWindowResolverDependencies extends CountrySettingsResolverDependencies {
  logger: ILifecycleLogger;
}

export type CheckInWindowResolver = (request: GoalkeeperRequest) => Promise<CheckInWindowConfig>;

const FIELDS = ['opensMinutesBefore', 'closesMinutesAfter'] as const;

/**
 * The check-in window values of the match's country (feature 020, research §4): the country-level
 * booking settings over the Colombia defaults, with a warning naming what was defaulted. Never
 * fails. Cached per city for the resolver's lifetime.
 */
export function createCheckInWindowResolver(deps: CheckInWindowResolverDependencies): CheckInWindowResolver {
  const country = createCountrySettingsResolver(deps);
  return async (request) => {
    const cityId = request.match.cityId;
    const { countryId, settings } = await country(cityId);
    const configured = settings?.checkInWindow ?? {};
    const config: CheckInWindowConfig = { ...CHECK_IN_DEFAULTS };
    const defaulted: string[] = [];
    for (const field of FIELDS) {
      const value = configured[field];
      if (value === undefined || value === null) defaulted.push(field);
      else config[field] = value;
    }
    if (defaulted.length > 0) {
      deps.logger.warn({ outcome: 'check_in_window_defaulted', cityId, countryId, defaulted }, 'Check-in window values missing for the country; using the defaults');
    }
    return config;
  };
}

/** Minutes after the end before a no-show, by default (feature 021). */
export const NO_SHOW_GRACE_DEFAULT_MINUTES = 60;

/** The no-show grace period of the match's country (feature 021), default 60 with a warning. */
export function createNoShowGraceResolver(deps: CheckInWindowResolverDependencies): (request: GoalkeeperRequest) => Promise<number> {
  const country = createCountrySettingsResolver(deps);
  return async (request) => {
    const cityId = request.match.cityId;
    const { countryId, settings } = await country(cityId);
    if (settings?.noShowGraceMinutes != null) return settings.noShowGraceMinutes;
    deps.logger.warn({ outcome: 'no_show_grace_defaulted', cityId, countryId }, 'No-show grace period missing for the country; using the default');
    return NO_SHOW_GRACE_DEFAULT_MINUTES;
  };
}

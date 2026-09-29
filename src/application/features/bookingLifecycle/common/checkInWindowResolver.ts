import { CHECK_IN_DEFAULTS, type CheckInWindowConfig } from '../../../../domain/bookings/checkInWindow.js';
import type { GoalkeeperRequest } from '../../../../domain/bookings/goalkeeperRequest.js';
import type { IBookingSettingsRepository } from '../../goalkeeperRequests/common/ports.js';
import type { ICityRepository, IRegionRepository } from '../../locations/common/ports.js';
import type { ILifecycleLogger } from './ports.js';

export interface CheckInWindowResolverDependencies {
  cityRepository: ICityRepository;
  regionRepository: IRegionRepository;
  bookingSettingsRepository: IBookingSettingsRepository;
  logger: ILifecycleLogger;
}

export type CheckInWindowResolver = (request: GoalkeeperRequest) => Promise<CheckInWindowConfig>;

const FIELDS = ['opensMinutesBefore', 'closesMinutesAfter'] as const;

/**
 * The check-in window values of the match's country (research §4): the country-level booking
 * settings over the Colombia defaults, with a warning naming what was defaulted. Never fails.
 * Cached per city for the resolver's lifetime — create one per request or per sweep run.
 */
export function createCheckInWindowResolver(deps: CheckInWindowResolverDependencies): CheckInWindowResolver {
  const cache = new Map<string, Promise<CheckInWindowConfig>>();
  const resolve = async (cityId: string): Promise<CheckInWindowConfig> => {
    const city = await deps.cityRepository.getById(cityId);
    const region = city ? (await deps.regionRepository.getByIds([city.regionId]))[0] : undefined;
    const countryId = region?.countryId ?? null;
    const configured = (await deps.bookingSettingsRepository.findFor(cityId, countryId)).country?.checkInWindow ?? {};

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
  return (request) => {
    const cityId = request.match.cityId;
    let found = cache.get(cityId);
    if (!found) {
      found = resolve(cityId);
      cache.set(cityId, found);
    }
    return found;
  };
}

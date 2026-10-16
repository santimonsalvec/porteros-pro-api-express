import {
  DEFAULT_GOALKEEPER_PENALTIES,
  PENALTY_CONFIG_FIELDS,
  type GoalkeeperPenaltyConfig,
} from '../../../../domain/goalkeepers/penaltyPolicy.js';
import type { IBookingSettingsRepository } from '../../goalkeeperRequests/common/ports.js';
import {
  resolveGoalkeeperOperatingBalanceContext,
  type GoalkeeperOperatingBalanceContextDependencies,
} from '../../operatingBalance/common/goalkeeperOperatingBalanceContext.js';
import type { ILifecycleLogger } from './ports.js';

export interface PenaltyConfigDependencies {
  operatingBalanceContext: GoalkeeperOperatingBalanceContextDependencies;
  bookingSettingsRepository: IBookingSettingsRepository;
  logger: ILifecycleLogger;
}

/**
 * The penalty values of the goalkeeper's country (research §7): the country-level booking settings
 * merged over the Colombia defaults. Never fails a withdrawal: anything missing falls back to the
 * default, with a warning naming what was defaulted.
 */
export async function resolvePenaltyConfig(deps: PenaltyConfigDependencies, goalkeeperId: string): Promise<GoalkeeperPenaltyConfig> {
  const context = await resolveGoalkeeperOperatingBalanceContext(deps.operatingBalanceContext, goalkeeperId);
  const countryId = context.kind === 'ok' ? context.countryId : null;
  const marketId = context.kind === 'ok' ? context.profile.marketId : context.kind === 'operating_balance_not_configured' ? context.marketId : null;
  const configured = marketId !== null ? (await deps.bookingSettingsRepository.findFor(marketId, countryId)).country?.goalkeeperPenalties ?? {} : {};

  const config: GoalkeeperPenaltyConfig = { ...DEFAULT_GOALKEEPER_PENALTIES };
  const defaulted: string[] = [];
  for (const field of PENALTY_CONFIG_FIELDS) {
    const value = configured[field];
    if (value === undefined || value === null) defaulted.push(field);
    else config[field] = value;
  }
  if (defaulted.length > 0) {
    deps.logger.warn(
      { outcome: 'penalty_config_defaulted', goalkeeperId, countryId, defaulted },
      'Goalkeeper penalty values missing for the country; using the defaults',
    );
  }
  return config;
}

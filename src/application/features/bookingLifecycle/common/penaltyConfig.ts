import {
  DEFAULT_GOALKEEPER_PENALTIES,
  PENALTY_CONFIG_FIELDS,
  type GoalkeeperPenaltyConfig,
} from '../../../../domain/goalkeepers/penaltyPolicy.js';
import type { IBookingSettingsRepository } from '../../goalkeeperRequests/common/ports.js';
import {
  resolveGoalkeeperWalletContext,
  type GoalkeeperWalletContextDependencies,
} from '../../wallet/common/goalkeeperWalletContext.js';
import type { ILifecycleLogger } from './ports.js';

export interface PenaltyConfigDependencies {
  walletContext: GoalkeeperWalletContextDependencies;
  bookingSettingsRepository: IBookingSettingsRepository;
  logger: ILifecycleLogger;
}

/**
 * The penalty values of the goalkeeper's country (research §7): the country-level booking settings
 * merged over the Colombia defaults. Never fails a withdrawal: anything missing falls back to the
 * default, with a warning naming what was defaulted.
 */
export async function resolvePenaltyConfig(deps: PenaltyConfigDependencies, goalkeeperId: string): Promise<GoalkeeperPenaltyConfig> {
  const context = await resolveGoalkeeperWalletContext(deps.walletContext, goalkeeperId);
  const countryId = context.kind === 'ok' ? context.countryId : null;
  const cityId = context.kind === 'ok' ? context.profile.cityId : context.kind === 'wallet_not_configured' ? context.cityId : null;
  const configured = cityId !== null ? (await deps.bookingSettingsRepository.findFor(cityId, countryId)).country?.goalkeeperPenalties ?? {} : {};

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

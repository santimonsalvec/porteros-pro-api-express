import type { GoalkeeperProfile } from '../../../../domain/goalkeepers/goalkeeperProfile.js';
import type { InvoicingSnapshot } from '../../../../domain/operatingBalance/balanceMovement.js';
import type { IGoalkeeperProfileRepository } from '../../goalkeepers/common/ports.js';
import type { ICountryLookup } from '../../goalkeeperRequests/common/ports.js';
import type { IMarketRepository } from '../../markets/common/ports.js';

export interface GoalkeeperOperatingBalanceContextDependencies {
  goalkeeperProfileRepository: IGoalkeeperProfileRepository;
  marketRepository: IMarketRepository;
  countryLookup: ICountryLookup;
}

export type GoalkeeperOperatingBalanceContext =
  | { kind: 'not_a_goalkeeper' }
  | { kind: 'operating_balance_not_configured'; marketId: string }
  | {
      kind: 'ok';
      profile: GoalkeeperProfile;
      /** The operating balance's currency: that of the country of the profile's market. */
      currency: string;
      countryId: string;
      invoicing: InvoicingSnapshot;
    };

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * Who owns the operating balance and in which currency (research.md §6): an active goalkeeper (an existing
 * `GoalkeeperProfile`) and the currency of their profile market's country — market →
 * country, the same path the quote uses. A country or currency that cannot be resolved is a
 * configuration gap, reported rather than guessed.
 */
export async function resolveGoalkeeperOperatingBalanceContext(
  deps: GoalkeeperOperatingBalanceContextDependencies,
  goalkeeperId: string,
): Promise<GoalkeeperOperatingBalanceContext> {
  const profile = await deps.goalkeeperProfileRepository.getByUserId(goalkeeperId);
  if (!profile) return { kind: 'not_a_goalkeeper' };

  const market = await deps.marketRepository.getById(profile.marketId);
  const countryId = market?.countryId ?? null;
  const country = countryId ? await deps.countryLookup.getById(countryId) : null;
  const currency = country?.currency ?? null;
  if (!countryId || !currency || !CURRENCY_PATTERN.test(currency)) {
    return { kind: 'operating_balance_not_configured', marketId: profile.marketId };
  }

  return {
    kind: 'ok',
    profile,
    currency,
    countryId,
    invoicing: { documentType: profile.documentType, documentNumber: profile.documentNumber },
  };
}

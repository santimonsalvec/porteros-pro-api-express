import type { GoalkeeperProfile } from '../../../../domain/goalkeepers/goalkeeperProfile.js';
import type { InvoicingSnapshot } from '../../../../domain/wallet/walletMovement.js';
import type { IGoalkeeperProfileRepository } from '../../goalkeepers/common/ports.js';
import type { ICountryLookup } from '../../goalkeeperRequests/common/ports.js';
import type { ICityRepository, IRegionRepository } from '../../locations/common/ports.js';

export interface GoalkeeperWalletContextDependencies {
  goalkeeperProfileRepository: IGoalkeeperProfileRepository;
  cityRepository: ICityRepository;
  regionRepository: IRegionRepository;
  countryLookup: ICountryLookup;
}

export type GoalkeeperWalletContext =
  | { kind: 'not_a_goalkeeper' }
  | { kind: 'wallet_not_configured'; cityId: string }
  | {
      kind: 'ok';
      profile: GoalkeeperProfile;
      /** The wallet's currency: that of the country of the profile's city. */
      currency: string;
      countryId: string;
      invoicing: InvoicingSnapshot;
    };

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * Who owns the wallet and in which currency (research.md §6): an active goalkeeper (an existing
 * `GoalkeeperProfile`) and the currency of their profile city's country — city → region →
 * country, the same path the quote uses. A country or currency that cannot be resolved is a
 * configuration gap, reported rather than guessed.
 */
export async function resolveGoalkeeperWalletContext(
  deps: GoalkeeperWalletContextDependencies,
  goalkeeperId: string,
): Promise<GoalkeeperWalletContext> {
  const profile = await deps.goalkeeperProfileRepository.getByUserId(goalkeeperId);
  if (!profile) return { kind: 'not_a_goalkeeper' };

  const city = await deps.cityRepository.getById(profile.cityId);
  const region = city ? (await deps.regionRepository.getByIds([city.regionId]))[0] : undefined;
  const countryId = region?.countryId ?? null;
  const country = countryId ? await deps.countryLookup.getById(countryId) : null;
  const currency = country?.currency ?? null;
  if (!countryId || !currency || !CURRENCY_PATTERN.test(currency)) {
    return { kind: 'wallet_not_configured', cityId: profile.cityId };
  }

  return {
    kind: 'ok',
    profile,
    currency,
    countryId,
    invoicing: { documentType: profile.documentType, documentNumber: profile.documentNumber },
  };
}

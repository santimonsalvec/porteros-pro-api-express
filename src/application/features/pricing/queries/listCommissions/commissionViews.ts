import type { IClock } from '../../../../common/clock.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import { formatLocalIso, isValidTimeZone } from '../../../goalkeeperRequests/common/zonedTime.js';
import type { ITaxSettingsRepository } from '../../../operatingBalance/common/ports.js';
import { PricingGeography, type PricingGeographyDependencies } from '../../common/pricingGeography.js';
import type { CommissionRecord } from '../../common/ports.js';
import { vatRatesOf } from '../../common/vatRates.js';
import { commissionView, type CommissionView, type GoalkeeperRulePart, type PriceTarget } from '../../common/views.js';

export interface CommissionViewDependencies extends PricingGeographyDependencies {
  taxSettings: ITaxSettingsRepository;
  /** Feature 033: goalkeeper rules hang from the goalkeeper's market; shown with their name and validity. */
  goalkeeperProfiles: Pick<IGoalkeeperProfileRepository, 'getByUserId'>;
  users: Pick<IUserRepository, 'getByIds'>;
  clock: IClock;
}

/** `YYYY-MM-DDTHH:mm` in the market's zone, as the admin typed it. */
export function localExpiry(validUntil: Date | null, timeZone: string): string | null {
  return validUntil ? formatLocalIso(validUntil.getTime(), timeZone).slice(0, 16) : null;
}

/** Commissions joined with their target and their country's VAT, in one pass; goalkeeper rules with whose they are and whether they still apply. */
export async function commissionViews(
  deps: CommissionViewDependencies,
  records: readonly CommissionRecord[],
): Promise<{ views: CommissionView[]; geography: PricingGeography }> {
  const geography = await PricingGeography.load(deps);
  const now = deps.clock.now();
  const goalkeeperIds = [...new Set(records.filter((record) => record.scope === 'goalkeeper').map((record) => record.refId))];
  const [profiles, users] = await Promise.all([
    Promise.all(goalkeeperIds.map(async (userId) => [userId, await deps.goalkeeperProfiles.getByUserId(userId)] as const)),
    goalkeeperIds.length > 0 ? deps.users.getByIds(goalkeeperIds) : [],
  ]);
  const profileOf = new Map(profiles);
  const nameOf = new Map(users.map((user) => [user.id, user.displayName ?? ([user.firstName, user.lastName].filter(Boolean).join(' ') || null)]));

  const targets: PriceTarget[] = records.map((record) => {
    if (record.scope !== 'goalkeeper') return geography.target(record.scope, record.refId);
    const profile = profileOf.get(record.refId);
    return profile ? geography.target('market', profile.marketId) : geography.target('market', '');
  });
  const vat = await vatRatesOf(deps.taxSettings, targets.map((target) => target.countryId));
  const views = records.map((record, index) => {
    const target = targets[index]!;
    const vatRateBps = target.countryId === null ? 0 : (vat.get(target.countryId) ?? 0);
    if (record.scope !== 'goalkeeper') return commissionView(record, target, vatRateBps);
    const market = profileOf.get(record.refId) ? geography.market(profileOf.get(record.refId)!.marketId) : null;
    const timeZone = market && isValidTimeZone(market.timeZone) ? market.timeZone : null;
    const goalkeeper: GoalkeeperRulePart = {
      goalkeeper: { userId: record.refId, name: nameOf.get(record.refId) ?? null },
      validUntil: record.validUntil?.toISOString() ?? null,
      validUntilLocal: timeZone ? localExpiry(record.validUntil, timeZone) : null,
      timeZone,
      validity:
        record.validUntil !== null && record.validUntil.getTime() <= now.getTime()
          ? 'expired'
          : target.countryId !== null && record.countryId !== target.countryId
            ? 'other_country'
            : 'active',
    };
    return commissionView(record, target, vatRateBps, goalkeeper);
  });
  return { views, geography };
}

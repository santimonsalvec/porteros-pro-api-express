import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IClock } from '../../../../common/clock.js';
import type { IBackgroundCheckRepository, IGoalkeeperProfileRepository, IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import type { GoalkeeperProfile } from '../../../../../domain/goalkeepers/goalkeeperProfile.js';
import type { ICityRepository, IRegionRepository } from '../../../locations/common/ports.js';
import {
  toActiveGoalkeeperResponse,
  toGoalkeeperRegistrationResponse,
  type GoalkeeperCityView,
  type GoalkeeperVettingSummary,
} from '../../common/goalkeeperRegistrationResponse.js';
import { GetGoalkeeperRegistrationQuery, type GetGoalkeeperRegistrationResult } from './getGoalkeeperRegistrationQuery.js';

export class GetGoalkeeperRegistrationQueryHandler
  implements IQueryHandler<GetGoalkeeperRegistrationQuery, GetGoalkeeperRegistrationResult>
{
  constructor(
    private readonly goalkeeperRegistrationRepository: IGoalkeeperRegistrationRepository,
    private readonly goalkeeperProfileRepository: IGoalkeeperProfileRepository,
    private readonly cityRepository: ICityRepository,
    private readonly regionRepository: IRegionRepository,
    /** Admin spec 030: the goalkeeper's background checks, for the vetting summary. */
    private readonly vetting?: {
      checks: Pick<IBackgroundCheckRepository, 'listForGoalkeeper'>;
      clock: IClock;
      /** The terms of each zone for goalkeepers without the seal. */
      discounts?: { forZones(zoneIds: readonly string[]): Promise<Map<string, { discountBps: number }>> };
    },
  ) {}

  async handle(query: GetGoalkeeperRegistrationQuery): Promise<GetGoalkeeperRegistrationResult> {
    // For an active goalkeeper the profile — not the registration locked at activation — holds the current values.
    const profile = await this.goalkeeperProfileRepository.getByUserId(query.userId);
    const registration = profile
      ? toActiveGoalkeeperResponse(profile)
      : toGoalkeeperRegistrationResponse(await this.goalkeeperRegistrationRepository.getByUserId(query.userId));

    const city = await this.resolveCity(registration.cityId);
    return { registration: { ...registration, city, ...(profile ? { vetting: await this.vettingOf(profile) } : {}) } };
  }

  private async vettingOf(profile: GoalkeeperProfile): Promise<GoalkeeperVettingSummary> {
    const checks = this.vetting ? await this.vetting.checks.listForGoalkeeper(profile.userId) : [];
    const now = this.vetting?.clock.now() ?? new Date();
    const rejection = profile.vetting.lastRejection;
    return {
      tier: profile.tier,
      rejection: profile.tier === 'unvalidated' && rejection ? { reason: rejection.reason, at: rejection.at.toISOString() } : null,
      backgroundChecks: {
        pending: checks.filter((check) => check.status === 'pending').length,
        approved: checks.filter((check) => check.status === 'approved' && !check.isExpiredAt(now)).length,
        rejected: checks.filter((check) => check.status === 'rejected').length,
        expired: checks.filter((check) => check.isExpiredAt(now)).length,
      },
      unverifiedDiscount: profile.tier === 'validated' ? await this.discountRange(profile.zoneIds) : null,
    };
  }

  /** The discount range across the goalkeeper's zones; null when none of them has one (FR-017a). */
  private async discountRange(zoneIds: readonly string[]): Promise<{ minBps: number; maxBps: number } | null> {
    if (!this.vetting?.discounts || zoneIds.length === 0) return null;
    const terms = await this.vetting.discounts.forZones(zoneIds);
    const rates = zoneIds.map((zoneId) => terms.get(zoneId)?.discountBps ?? 0);
    const maxBps = Math.max(...rates);
    return maxBps > 0 ? { minBps: Math.min(...rates), maxBps } : null;
  }

  private async resolveCity(cityId: string | null): Promise<GoalkeeperCityView | null> {
    if (cityId === null) return null;

    const city = await this.cityRepository.getById(cityId);
    if (!city) return null;

    const [region] = await this.regionRepository.getByIds([city.regionId]);
    return { id: city.id, name: city.name, region: region?.name ?? '' };
  }
}

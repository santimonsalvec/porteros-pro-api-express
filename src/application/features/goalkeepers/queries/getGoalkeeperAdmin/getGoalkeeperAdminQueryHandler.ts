import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { documentVersion } from '../../../../../domain/users/contactVersion.js';
import { userName } from '../../../users/common/userViewing.js';
import type { GoalkeepersAdminDependencies } from '../../common/goalkeepersAdminDependencies.js';
import { GetGoalkeeperAdminQuery, type GetGoalkeeperAdminResult } from './getGoalkeeperAdminQuery.js';

export class GetGoalkeeperAdminQueryHandler implements IQueryHandler<GetGoalkeeperAdminQuery, GetGoalkeeperAdminResult> {
  constructor(private readonly deps: GoalkeepersAdminDependencies) {}

  async handle({ userId }: GetGoalkeeperAdminQuery): Promise<GetGoalkeeperAdminResult> {
    const profile = await this.deps.profiles.getByUserId(userId);
    if (!profile) return { outcome: 'not_a_goalkeeper' };
    const [user, city, zones, documentType, block, ratings, incidents, month] = await Promise.all([
      this.deps.users.getById(userId),
      this.deps.cities.getById(profile.cityId),
      this.deps.zones.getManyByIds(profile.zoneIds),
      this.deps.documentTypes.findByCode(profile.documentType),
      this.deps.blocks.findByUserId(userId),
      this.deps.reader.ratingsFor([userId]),
      this.deps.reader.incidentCounts(userId),
      this.deps.monthStats(userId),
    ]);
    const now = this.deps.clock.now();
    const zonesById = new Map(zones.map((zone) => [zone.id, zone]));
    return {
      outcome: 'ok',
      goalkeeper: {
        userId,
        name: user ? userName(user) : null,
        birthDate: profile.birthDate.toISOString(),
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        activatedAt: profile.activatedAt.toISOString(),
        city: city ? { id: city.id, name: city.name, timeZone: city.timeZone } : null,
        // In the profile's order; a zone deleted since keeps its id as its name.
        zones: profile.zoneIds.map((id) => {
          const zone = zonesById.get(id);
          return { id, name: zone?.name ?? id, active: zone?.active ?? false };
        }),
        availableForOffers: profile.availableForOffers,
        suspendedUntil: profile.suspendedUntil && profile.suspendedUntil > now ? profile.suspendedUntil.toISOString() : null,
        blocked: block?.blocked ?? false,
        documentType: { code: profile.documentType, name: documentType?.name ?? profile.documentType },
        version: documentVersion(profile),
        rating: ratings.get(userId) ?? null,
        vetting: { tier: profile.tier, verificationMethod: profile.vetting.verification?.method ?? null },
        stats: {
          month:
            month.outcome === 'success'
              ? { playedCount: month.stats.playedCount, earned: month.stats.earned, toPlay: month.stats.toPlay, currency: month.stats.currency }
              : null,
          withdrawalCount: incidents.withdrawal,
          noShowCount: incidents.no_show,
        },
      },
    };
  }
}

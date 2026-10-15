import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import type { IImageRepository } from '../../../images/common/ports.js';
import type { IRatingRepository } from '../../../ratings/common/ports.js';
import type { IStaffMemberRepository } from '../../../staff/common/ports.js';
import { memberRef, userName } from '../../../users/common/userViewing.js';
import { canApproveValidation } from '../../../../../domain/goalkeepers/backgroundCheck.js';
import type { Verification } from '../../../../../domain/goalkeepers/vetting.js';
import type { VettingDependencies } from '../../common/vettingDependencies.js';
import { toMyBackgroundCheck, type ActorView, type VerificationDetailsView } from '../../common/vettingViews.js';
import { GetGoalkeeperVettingQuery, type GetGoalkeeperVettingResult } from './getGoalkeeperVettingQuery.js';

/** The history shown in the tab: enough for any goalkeeper's lifetime of decisions. */
const HISTORY_LIMIT = 200;

export interface GetGoalkeeperVettingDependencies extends Pick<VettingDependencies, 'profiles' | 'checks' | 'log' | 'clock'> {
  images: Pick<IImageRepository, 'getById'>;
  staff: Pick<IStaffMemberRepository, 'findByUserId'>;
  users: Pick<IUserRepository, 'getByIds'>;
  ratings: Pick<IRatingRepository, 'summaryForGoalkeeper'>;
}

export class GetGoalkeeperVettingQueryHandler implements IQueryHandler<GetGoalkeeperVettingQuery, GetGoalkeeperVettingResult> {
  constructor(private readonly deps: GetGoalkeeperVettingDependencies) {}

  async handle(query: GetGoalkeeperVettingQuery): Promise<GetGoalkeeperVettingResult> {
    const { goalkeeperId } = query;
    const profile = await this.deps.profiles.getByUserId(goalkeeperId);
    if (!profile) return { outcome: 'not_a_goalkeeper' };
    const now = this.deps.clock.now();
    const { vetting } = profile;

    const [checks, history, summary, front, back] = await Promise.all([
      this.deps.checks.listForGoalkeeper(goalkeeperId),
      this.deps.log.listForGoalkeeper(goalkeeperId, HISTORY_LIMIT),
      this.deps.ratings.summaryForGoalkeeper(goalkeeperId),
      this.url(profile.documentPhotoAId),
      this.url(profile.documentPhotoBId),
    ]);

    const staffIds = new Set<string>();
    if (vetting.validatedBy) staffIds.add(vetting.validatedBy);
    if (vetting.lastRejection) staffIds.add(vetting.lastRejection.by);
    if (vetting.verification?.by.kind === 'staff') staffIds.add(vetting.verification.by.userId);
    for (const check of checks) if (check.reviewedBy) staffIds.add(check.reviewedBy);
    for (const entry of history) if (entry.actor.kind === 'staff') staffIds.add(entry.actor.userId);
    const refs = await Promise.all([...staffIds].map((id) => memberRef(this.deps.staff, id)));
    const members = new Map(refs.flatMap((ref) => (ref ? [[ref.userId, ref] as const] : [])));
    const member = (id: string) => members.get(id) ?? { userId: id, name: 'Miembro del equipo' };
    const actor = (value: Verification['by']): ActorView => (value.kind === 'system' ? { kind: 'system' } : { kind: 'staff', ...member(value.userId) });

    const checkUrls = await Promise.all(checks.map((check) => this.url(check.imageId)));
    return {
      outcome: 'ok',
      vetting: {
        revision: vetting.revision,
        tier: profile.tier,
        validatedAt: vetting.validatedAt?.toISOString() ?? null,
        validatedBy: vetting.validatedBy ? member(vetting.validatedBy) : null,
        lastRejection: vetting.lastRejection
          ? { reason: vetting.lastRejection.reason, at: vetting.lastRejection.at.toISOString(), by: member(vetting.lastRejection.by) }
          : null,
        verification: vetting.verification
          ? {
              method: vetting.verification.method,
              at: vetting.verification.at.toISOString(),
              by: actor(vetting.verification.by),
              details: await this.details(vetting.verification),
            }
          : null,
        autoVerificationBlocked: vetting.autoVerificationBlocked,
        identification: { photos: { front, back } },
        backgroundChecks: checks.map((check, index) => ({
          ...toMyBackgroundCheck(check, checkUrls[index] ?? null, now),
          reviewedAt: check.reviewedAt?.toISOString() ?? null,
          reviewedBy: check.reviewedBy ? member(check.reviewedBy) : null,
          expiringSoon: check.isExpiringSoonAt(now),
          revision: check.revision,
        })),
        reputation: { ratingCount: summary.count, ratingAverage: summary.average },
        canApproveValidation: canApproveValidation(profile, checks, now),
        history: history.map((entry) => ({
          id: entry.id,
          at: entry.at.toISOString(),
          actor: actor(entry.actor),
          action: entry.action,
          method: entry.method,
          reason: entry.reason,
          details: entry.details,
        })),
      },
    };
  }

  private async url(imageId: string | null): Promise<string | null> {
    if (!imageId) return null;
    return (await this.deps.images.getById(imageId))?.url ?? null;
  }

  private async details(verification: Verification): Promise<VerificationDetailsView> {
    const { details } = verification;
    if ('referrerId' in details) {
      const [user] = await this.deps.users.getByIds([details.referrerId]);
      const referrer = await this.deps.profiles.getByUserId(details.referrerId);
      return { referrer: { userId: details.referrerId, name: user ? userName(user) : null, active: referrer !== null && referrer.tier !== 'unvalidated' } };
    }
    if ('platformName' in details) {
      const urls = await Promise.all(details.evidenceImageIds.map((id) => this.url(id)));
      return { platformName: details.platformName, evidence: details.evidenceImageIds.map((imageId, index) => ({ imageId, url: urls[index] ?? null })) };
    }
    return details;
  }
}

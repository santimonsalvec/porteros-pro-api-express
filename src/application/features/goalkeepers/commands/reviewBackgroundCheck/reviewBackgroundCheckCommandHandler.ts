import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { reasonOrError, recordDecision, type VettingDependencies } from '../../common/vettingDependencies.js';
import { ReviewBackgroundCheckCommand, type ReviewBackgroundCheckResult } from './reviewBackgroundCheckCommand.js';

export class ReviewBackgroundCheckCommandHandler implements ICommandHandler<ReviewBackgroundCheckCommand, ReviewBackgroundCheckResult> {
  constructor(private readonly deps: Pick<VettingDependencies, 'profiles' | 'checks' | 'log' | 'idGenerator' | 'clock'>) {}

  async handle(command: ReviewBackgroundCheckCommand): Promise<ReviewBackgroundCheckResult> {
    const { staffUserId, goalkeeperId, checkId, revision, decision } = command.input;
    const now = this.deps.clock.now();
    if (!(await this.deps.profiles.getByUserId(goalkeeperId))) return { outcome: 'not_a_goalkeeper' };
    const check = await this.deps.checks.findForGoalkeeper(checkId, goalkeeperId);
    if (!check) return { outcome: 'not_found' };
    if (check.status !== 'pending') return { outcome: 'already_reviewed' };
    if (check.revision !== revision) return { outcome: 'stale' };

    let reviewed;
    let reason: string | null = null;
    if (decision === 'approve') {
      const { expiresAt } = command.input;
      if (expiresAt && expiresAt.getTime() <= now.getTime()) return { outcome: 'invalid_fields', fieldErrors: { expiresAt: 'expiresAt must be in the future' } };
      reviewed = check.approve(staffUserId, now, expiresAt);
    } else {
      const checked = reasonOrError(command.input.reason);
      if ('fieldErrors' in checked) return { outcome: 'invalid_fields', fieldErrors: checked.fieldErrors };
      reason = checked.reason;
      reviewed = check.reject(staffUserId, now, reason);
    }

    if ((await this.deps.checks.saveReview(reviewed, revision)) === 'stale') return { outcome: 'stale' };
    await recordDecision(this.deps, {
      goalkeeperId,
      at: now,
      actor: { kind: 'staff', userId: staffUserId },
      action: decision === 'approve' ? 'background_check.approved' : 'background_check.rejected',
      reason,
      details: { backgroundCheckId: check.id, expiresAt: reviewed.expiresAt?.toISOString() ?? null },
    });
    return { outcome: 'reviewed' };
  }
}

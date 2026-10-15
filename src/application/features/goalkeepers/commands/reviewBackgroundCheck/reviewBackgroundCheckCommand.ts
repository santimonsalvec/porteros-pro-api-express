import { ICommand } from '../../../../common/mediator/types.js';
import type { FieldErrors } from '../../common/vettingDependencies.js';

export type ReviewBackgroundCheckResult =
  | { outcome: 'reviewed' }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'not_found' }
  | { outcome: 'already_reviewed' }
  | { outcome: 'stale' }
  | { outcome: 'invalid_fields'; fieldErrors: FieldErrors };

/** An administrator approves (with an expiry) or rejects (with a reason) one background check (contracts C3). */
export class ReviewBackgroundCheckCommand extends ICommand<ReviewBackgroundCheckResult> {
  constructor(
    public readonly input: {
      staffUserId: string;
      goalkeeperId: string;
      checkId: string;
      /** The check's revision as the administrator read it. */
      revision: number;
      decision: 'approve' | 'reject';
      reason?: string;
      /** Defaults to one year after the approval. */
      expiresAt?: Date;
    },
  ) {
    super();
  }
}

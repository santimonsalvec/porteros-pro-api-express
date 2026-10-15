import { ICommand } from '../../../../common/mediator/types.js';
import type { VerificationInput } from '../../common/verificationInput.js';
import type { FieldErrors } from '../../common/vettingDependencies.js';

export type VerifyGoalkeeperResult =
  | { outcome: 'verified' }
  /** A practice the goalkeeper did not pass: recorded in the history, no seal. */
  | { outcome: 'practice_failed' }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'not_validated' }
  | { outcome: 'already_verified' }
  | { outcome: 'stale' }
  | { outcome: 'invalid_referrer' }
  | { outcome: 'invalid_evidence' }
  | { outcome: 'invalid_fields'; fieldErrors: FieldErrors };

/** An administrator gives a validated goalkeeper the verification seal (admin spec 030, contracts C6). */
export class VerifyGoalkeeperCommand extends ICommand<VerifyGoalkeeperResult> {
  constructor(
    public readonly input: {
      staffUserId: string;
      goalkeeperId: string;
      /** The vetting revision as the administrator read it. */
      revision: number;
      verification: VerificationInput;
    },
  ) {
    super();
  }
}

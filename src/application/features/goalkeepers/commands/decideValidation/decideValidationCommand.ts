import { ICommand } from '../../../../common/mediator/types.js';
import type { ValidationGap } from '../../../../../domain/goalkeepers/backgroundCheck.js';
import type { FieldErrors } from '../../common/vettingDependencies.js';
import type { VerificationInput } from '../../common/verificationInput.js';

export type DecideValidationResult =
  | { outcome: 'approved' }
  | { outcome: 'rejected' }
  | { outcome: 'not_a_goalkeeper' }
  /** FR-004: what still has to happen before validating. */
  | { outcome: 'not_ready'; missing: ValidationGap[] }
  | { outcome: 'already_validated' }
  | { outcome: 'stale' }
  | { outcome: 'invalid_fields'; fieldErrors: FieldErrors }
  /** Only with a verification in the same step (FR-011). */
  | { outcome: 'invalid_referrer' }
  | { outcome: 'invalid_evidence' };

/** An administrator validates the goalkeeper, or rejects the validation with a reason (contracts C4). */
export class DecideValidationCommand extends ICommand<DecideValidationResult> {
  constructor(
    public readonly input: {
      staffUserId: string;
      goalkeeperId: string;
      /** The vetting revision as the administrator read it. */
      revision: number;
      decision: 'approve' | 'reject';
      reason?: string;
      /** Validate and verify in one step (FR-011); only with `approve`. */
      verification?: VerificationInput;
    },
  ) {
    super();
  }
}

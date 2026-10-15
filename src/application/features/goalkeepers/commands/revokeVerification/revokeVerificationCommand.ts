import { ICommand } from '../../../../common/mediator/types.js';
import type { FieldErrors } from '../../common/vettingDependencies.js';

export type RevokeVerificationResult =
  | { outcome: 'revoked' }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'not_verified' }
  | { outcome: 'stale' }
  | { outcome: 'invalid_fields'; fieldErrors: FieldErrors };

/** An administrator revokes the goalkeeper's verification, with a reason (admin spec 030, FR-020). */
export class RevokeVerificationCommand extends ICommand<RevokeVerificationResult> {
  constructor(public readonly input: { staffUserId: string; goalkeeperId: string; revision: number; reason: string }) {
    super();
  }
}

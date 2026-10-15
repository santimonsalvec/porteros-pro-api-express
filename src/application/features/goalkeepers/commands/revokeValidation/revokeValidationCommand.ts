import { ICommand } from '../../../../common/mediator/types.js';
import type { FieldErrors } from '../../common/vettingDependencies.js';

export type RevokeValidationResult =
  | { outcome: 'revoked' }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'not_validated' }
  | { outcome: 'stale' }
  | { outcome: 'invalid_fields'; fieldErrors: FieldErrors };

/** An administrator revokes the goalkeeper's validation, with a reason (admin spec 030, FR-020). */
export class RevokeValidationCommand extends ICommand<RevokeValidationResult> {
  constructor(public readonly input: { staffUserId: string; goalkeeperId: string; revision: number; reason: string }) {
    super();
  }
}

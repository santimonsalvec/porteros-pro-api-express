import { ICommand } from '../../../../common/mediator/types.js';
import type { GoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';

export type UpdateGoalkeeperPhysicalDataOutcome = 'success' | 'validation_failed' | 'not_a_goalkeeper' | 'not_active';

export interface UpdateGoalkeeperPhysicalDataResult {
  outcome: UpdateGoalkeeperPhysicalDataOutcome;
  goalkeeper?: GoalkeeperRegistrationResponse;
  fieldErrors?: Record<string, string>;
}

/** Edits an ALREADY ACTIVE goalkeeper's physical data; either field may be omitted (partial update). */
export class UpdateGoalkeeperPhysicalDataCommand extends ICommand<UpdateGoalkeeperPhysicalDataResult> {
  constructor(
    public readonly userId: string,
    public readonly heightCm?: number,
    public readonly weightKg?: number,
  ) {
    super();
  }
}

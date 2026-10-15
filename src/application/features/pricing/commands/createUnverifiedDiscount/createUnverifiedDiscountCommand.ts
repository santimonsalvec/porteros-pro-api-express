import { ICommand } from '../../../../common/mediator/types.js';
import type { TargetFailure } from '../../common/pricingGeography.js';

export type CreateUnverifiedDiscountResult =
  | { outcome: 'saved'; id: string }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> }
  | { outcome: 'duplicate'; existingId: string | null }
  | TargetFailure;

/** Sets the terms of one level that had none (contracts D2). */
export class CreateUnverifiedDiscountCommand extends ICommand<CreateUnverifiedDiscountResult> {
  constructor(public readonly input: { scope: 'country' | 'city' | 'zone'; refId: string; discountBps: number | null; verifiedPriorityMinutes: number | null }) {
    super();
  }
}

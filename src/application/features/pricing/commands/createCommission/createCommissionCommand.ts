import { ICommand } from '../../../../common/mediator/types.js';
import type { MatchLevel, PricedModality } from '../../../../../domain/bookings/matchFormat.js';
import type { TargetFailure } from '../../common/pricingGeography.js';

export interface CommissionInput {
  scope: 'country' | 'city' | 'zone';
  refId: string;
  modality: PricedModality | null;
  level: MatchLevel | null;
  amount: number;
}

export type CreateCommissionResult =
  | { outcome: 'saved'; commissionId: string }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> }
  | { outcome: 'duplicate'; existingId: string | null }
  | TargetFailure;

/** Sets the platform's net commission for a country, an anchor city or a zone (admin spec 004, US3). */
export class CreateCommissionCommand extends ICommand<CreateCommissionResult> {
  constructor(readonly input: CommissionInput) {
    super();
  }
}

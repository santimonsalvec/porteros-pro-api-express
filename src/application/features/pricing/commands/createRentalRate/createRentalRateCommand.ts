import { ICommand } from '../../../../common/mediator/types.js';
import type { MatchLevel, PricedModality } from '../../../../../domain/bookings/matchFormat.js';
import type { TargetFailure } from '../../common/pricingGeography.js';

export interface RentalRateInput {
  scope: 'zone' | 'city';
  refId: string;
  durationMinutes: number;
  modality: PricedModality | null;
  level: MatchLevel | null;
  amount: number;
}

export type CreateRentalRateResult =
  | { outcome: 'saved'; rateId: string }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> }
  | { outcome: 'duplicate'; existingId: string | null }
  | TargetFailure;

/** Prices one duration (and optionally one modality and level) at an anchor city or a zone (admin spec 004, US1). */
export class CreateRentalRateCommand extends ICommand<CreateRentalRateResult> {
  constructor(readonly input: RentalRateInput) {
    super();
  }
}

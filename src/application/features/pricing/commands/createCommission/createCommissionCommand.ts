import { ICommand } from '../../../../common/mediator/types.js';
import type { PricedModality } from '../../../../../domain/bookings/matchFormat.js';
import type { CommissionScope } from '../../../../../domain/operatingBalance/commissionSetting.js';
import type { TargetFailure } from '../../common/pricingGeography.js';

export interface CommissionInput {
  scope: CommissionScope;
  /** A country, market or zone id, or the goalkeeper's userId. */
  refId: string;
  modality: PricedModality | null;
  fixedAmount: number;
  percentBps: number;
  /** Goalkeeper rules only: `YYYY-MM-DDTHH:mm` in the goalkeeper's market time zone; `null`/absent = never expires. */
  validUntilLocal?: string | null;
}

export type CreateCommissionResult =
  | { outcome: 'saved'; commissionId: string }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> }
  | { outcome: 'duplicate'; existingId: string | null }
  | { outcome: 'goalkeeper_not_found' }
  | TargetFailure;

/** Sets a commission rule — fixed, percentage or both — for a country, a market, a zone or one goalkeeper (feature 033). */
export class CreateCommissionCommand extends ICommand<CreateCommissionResult> {
  constructor(readonly input: CommissionInput) {
    super();
  }
}

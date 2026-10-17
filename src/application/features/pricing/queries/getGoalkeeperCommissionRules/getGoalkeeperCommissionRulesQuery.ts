import { IQuery } from '../../../../common/mediator/types.js';
import type { Modality } from '../../../../../domain/bookings/matchFormat.js';
import type { FallbackRule } from '../../common/deleteImpact.js';
import type { CommissionView } from '../../common/views.js';

export interface GoalkeeperCommissionRules {
  goalkeeper: { userId: string; name: string | null; marketId: string; marketName: string; countryId: string | null; currency: string | null; timeZone: string };
  /** The goalkeeper's own rules, active or not, with their validity. */
  rules: CommissionView[];
  /** Per tier, the general rule that applies without one of their own, at market → country level (a zone rule may still beat it). */
  general: { modality: Modality; rule: FallbackRule | null }[];
}

export type GetGoalkeeperCommissionRulesResult = { outcome: 'ok'; rules: GoalkeeperCommissionRules } | { outcome: 'not_found' };

/** A goalkeeper's commission rules and what applies without them (feature 033, admin "Comisión" tab). */
export class GetGoalkeeperCommissionRulesQuery extends IQuery<GetGoalkeeperCommissionRulesResult> {
  constructor(readonly goalkeeperId: string) {
    super();
  }
}

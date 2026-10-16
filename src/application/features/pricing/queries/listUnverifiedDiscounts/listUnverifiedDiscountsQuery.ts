import { IQuery } from '../../../../common/mediator/types.js';
import type { SettingOrigin } from '../../../../../domain/pricing/unverifiedDiscount.js';

export interface DiscountSettingView {
  id: string;
  discountBps: number | null;
  verifiedPriorityMinutes: number | null;
  revision: number;
}

/** What applies at a level and where each value comes from. */
export interface EffectiveTerms {
  discountBps: number;
  discountOrigin: SettingOrigin;
  verifiedPriorityMinutes: number;
  priorityOrigin: SettingOrigin;
}

export interface UnverifiedDiscountsView {
  /** The platform's ceiling (30 %). */
  maxBps: number;
  maxPriorityMinutes: number;
  country: { id: string; name: string; setting: DiscountSettingView | null; effective: EffectiveTerms };
  markets: { id: string; name: string; setting: DiscountSettingView | null; effective: EffectiveTerms }[];
  zones: { id: string; name: string; marketId: string; active: boolean; setting: DiscountSettingView | null; effective: EffectiveTerms }[];
}

export type ListUnverifiedDiscountsResult = { outcome: 'ok'; view: UnverifiedDiscountsView } | { outcome: 'not_found' };

/** A country's terms for goalkeepers without the seal at every level, with what each inherits (admin spec 030, contracts D1). */
export class ListUnverifiedDiscountsQuery extends IQuery<ListUnverifiedDiscountsResult> {
  constructor(public readonly countryId: string) {
    super();
  }
}

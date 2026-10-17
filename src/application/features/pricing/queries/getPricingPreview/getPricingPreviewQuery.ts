import { IQuery } from '../../../../common/mediator/types.js';
import type { Modality } from '../../../../../domain/bookings/matchFormat.js';
import type { ResolvedSetting } from '../../../goalkeeperRequests/common/resolveBookingSettings.js';

export interface PricingPreviewInput {
  zoneId: string;
  durationMinutes: number;
  modality: Modality;
  /** `YYYY-MM-DDTHH:mm` in the market's time zone. */
  startsAtLocal: string;
  /** The moment to quote from, same form; `null` = now (FR-013a). */
  quoteFromLocal: string | null;
  /** Feature 033: simulate for this goalkeeper, so their own active rule shows when it applies. */
  goalkeeperId?: string | null;
}

export type NotQuotableOutcome =
  | 'invalid_start_time'
  | 'start_time_in_past'
  | 'service_not_configured'
  | 'insufficient_notice'
  | 'outside_booking_window'
  | 'rate_not_configured'
  | 'zone_inactive';

/** The admin screen that fixes what stops a quote. */
export interface PreviewTarget {
  screen: 'rentalRates' | 'commissions' | 'bookingSettings' | 'country';
  id: string;
}

export interface PriceOrigin {
  scope: 'zone' | 'market' | 'country' | 'goalkeeper';
  refId: string;
  name: string;
  /** Goalkeeper rules only: `YYYY-MM-DDTHH:mm` in the market's time zone, `null` = never expires. */
  validUntilLocal?: string | null;
}

/** The commission of one goalkeeper, as the rule built it (feature 033): `amount` is the net. */
export interface PreviewCommission {
  base: number;
  percentBps: number;
  percentAmount: number;
  fixedAmount: number;
  amount: number;
  origin: PriceOrigin;
  tier: Tier;
}

type Tier = { modality: string | null };

export interface PricingPreview {
  zone: { id: string; name: string; active: boolean };
  market: { id: string; name: string };
  country: { id: string; name: string } | null;
  timeZone: string;
  startsAt: string;
  quoteFrom: string;
  leadMinutes: number;
  currency: string | null;
  quotable: { ok: true } | { ok: false; outcome: NotQuotableOutcome; detail: string; target: PreviewTarget | null };
  rate: { amount: number; origin: PriceOrigin; tier: Tier } | null;
  surcharge: { amount: number; tier: { fromMinutes: number; toMinutes: number | null } | null } | null;
  commission: PreviewCommission | null;
  vat: { rateBps: number; amount: number } | null;
  totalForGoalkeeper: number | null;
  rules: {
    bookingWindowDays: ResolvedSetting<number>;
    minNoticeMinutes: ResolvedSetting<number>;
    freeCancellationMinutes: ResolvedSetting<number>;
    travelBufferMinutes: ResolvedSetting<number>;
  };
}

export type GetPricingPreviewResult =
  | { outcome: 'ok'; preview: PricingPreview }
  | { outcome: 'not_found' }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> }
  | { outcome: 'time_zone_not_configured'; marketId: string };

/**
 * What a quote in this zone would charge and which rules would apply, with where each value comes
 * from (admin spec 004, US4). Same evaluation as the quote; never creates a quote or a booking.
 */
export class GetPricingPreviewQuery extends IQuery<GetPricingPreviewResult> {
  constructor(readonly input: PricingPreviewInput) {
    super();
  }
}

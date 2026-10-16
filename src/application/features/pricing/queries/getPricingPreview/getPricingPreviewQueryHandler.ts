import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { vatFor } from '../../../../../domain/operatingBalance/vat.js';
import type { RentalRate } from '../../../../../domain/pricing/rentalRate.js';
import type { MatchTier } from '../../../../../domain/pricing/tieredRate.js';
import { selectSurchargeTier, selectUnitRate } from '../../../goalkeeperRequests/common/pricing.js';
import { evaluateQuoteInArea, resolveStartInstant, type AreaQuoteResult, type QuoteEvaluationDependencies } from '../../../goalkeeperRequests/common/quoteEvaluation.js';
import { resolveBookingSettingsWithOrigin } from '../../../goalkeeperRequests/common/resolveBookingSettings.js';
import { parseStartsAt } from '../../../goalkeeperRequests/common/startsAt.js';
import { formatLocalIso, isValidTimeZone } from '../../../goalkeeperRequests/common/zonedTime.js';
import type { ITaxSettingsRepository } from '../../../operatingBalance/common/ports.js';
import type { CommissionSetting } from '../../../../../domain/operatingBalance/commissionSetting.js';
import type { PricingGeographyDependencies } from '../../common/pricingGeography.js';
import type { ICommissionSettingResolver } from '../../common/ports.js';
import {
  GetPricingPreviewQuery,
  type GetPricingPreviewResult,
  type NotQuotableOutcome,
  type PreviewTarget,
  type PriceOrigin,
  type PricingPreview,
} from './getPricingPreviewQuery.js';

export interface PricingPreviewDependencies extends PricingGeographyDependencies, QuoteEvaluationDependencies {
  commissionResolver: QuoteEvaluationDependencies['commissionResolver'] & ICommissionSettingResolver;
  taxSettings: ITaxSettingsRepository;
  clock: IClock;
}

type Names = { zone: string; market: string; country: string };

/** The moment as typed, read in the market's time zone; `null` when it does not exist there. */
function instantOf(local: string, timeZone: string): number | null {
  const parsed = parseStartsAt(`${local}:00`);
  if (!parsed) return null;
  const instant = resolveStartInstant(parsed, timeZone);
  return instant.kind === 'ok' ? instant.epochMs : null;
}

function originOf(document: { scope: string; refId: string }, names: Names): PriceOrigin {
  const scope = document.scope as PriceOrigin['scope'];
  return { scope, refId: document.refId, name: names[scope] };
}

const tierOf = (document: RentalRate | CommissionSetting) => ({ modality: document.modality, level: document.level });

const DETAILS: Record<NotQuotableOutcome, string> = {
  invalid_start_time: 'La hora debe ser en punto o y media',
  start_time_in_past: 'Ya pasó',
  service_not_configured: 'Falta configuración',
  insufficient_notice: 'Antes de la anticipación mínima',
  outside_booking_window: 'Fuera de la ventana de reserva',
  rate_not_configured: 'No hay tarifa para esta duración',
  zone_inactive: 'La zona está inactiva',
};

/** The screen that fixes what stops the quote (FR-014). */
function targetOf(result: Exclude<AreaQuoteResult, { outcome: 'priced' }>, marketId: string, countryId: string | null): PreviewTarget | null {
  switch (result.outcome) {
    case 'rate_not_configured':
      return { screen: 'rentalRates', id: marketId };
    case 'insufficient_notice':
    case 'outside_booking_window':
      return { screen: 'bookingSettings', id: marketId };
    case 'service_not_configured':
      if (result.missing.includes('currency') && countryId) return { screen: 'country', id: countryId };
      if (result.missing.length === 1 && result.missing[0] === 'commission') return { screen: 'commissions', id: marketId };
      return { screen: 'bookingSettings', id: marketId };
    case 'invalid_start_time':
    case 'start_time_in_past':
      return null;
  }
}

export class GetPricingPreviewQueryHandler implements IQueryHandler<GetPricingPreviewQuery, GetPricingPreviewResult> {
  constructor(private readonly deps: PricingPreviewDependencies) {}

  async handle({ input }: GetPricingPreviewQuery): Promise<GetPricingPreviewResult> {
    const zone = await this.deps.zones.getById(input.zoneId);
    if (!zone) return { outcome: 'not_found' };
    const market = await this.deps.markets.getById(zone.marketId);
    if (!market) return { outcome: 'not_found' };
    const timeZone = market.timeZone;
    if (!isValidTimeZone(timeZone)) return { outcome: 'time_zone_not_configured', marketId: market.id };

    const startMs = instantOf(input.startsAtLocal, timeZone);
    const nowMs = input.quoteFromLocal === null ? this.deps.clock.now().getTime() : instantOf(input.quoteFromLocal, timeZone);
    if (startMs === null) return { outcome: 'invalid', fieldErrors: { startsAtLocal: 'nonexistent_local_time' } };
    if (nowMs === null) return { outcome: 'invalid', fieldErrors: { quoteFromLocal: 'nonexistent_local_time' } };
    // A chosen moment after the start is a typing mistake; "now" after it just means the match is past.
    if (input.quoteFromLocal !== null && nowMs > startMs) return { outcome: 'invalid', fieldErrors: { quoteFromLocal: 'after_start' } };

    const match: MatchTier = { modality: input.modality, level: input.level };
    const countryId = market.countryId;
    const [evaluation, rates, settingsDocs, commission, country, tax] = await Promise.all([
      evaluateQuoteInArea(this.deps, {
        zone,
        market,
        timeZone,
        startsAt: parseStartsAt(`${input.startsAtLocal}:00`)!,
        goalkeeperCount: 1,
        durationMinutes: input.durationMinutes,
        match,
        nowMs,
      }),
      this.deps.rentalRateRepository.findForDuration(zone.id, market.id, input.durationMinutes),
      this.deps.bookingSettingsRepository.findFor(market.id, countryId),
      this.deps.commissionResolver.resolveSettingForMatch(zone.id, match),
      countryId ? this.deps.countries.getById(countryId) : null,
      countryId ? this.deps.taxSettings.getByCountry(countryId) : null,
    ]);

    const names: Names = { zone: zone.name, market: market.name, country: country?.name ?? '' };
    const rules = resolveBookingSettingsWithOrigin(settingsDocs);
    const leadMinutes = Math.max(0, Math.floor((startMs - nowMs) / 60_000));
    const rate = selectUnitRate(rates, match);
    const surchargeTiers = rules.leadTimeSurcharge.value?.tiers ?? null;
    const surchargeTier = surchargeTiers ? selectSurchargeTier(surchargeTiers, (startMs - nowMs) / 60_000) : null;
    const vatRateBps = tax?.vatRateBps ?? 0;
    const vatAmount = commission ? vatFor(commission.amount, vatRateBps) : null;

    const preview: PricingPreview = {
      zone: { id: zone.id, name: zone.name, active: zone.active },
      market: { id: market.id, name: market.name },
      country: country ? { id: country.id, name: country.name } : null,
      timeZone,
      startsAt: formatLocalIso(startMs, timeZone),
      quoteFrom: formatLocalIso(nowMs, timeZone),
      leadMinutes,
      currency: country?.currency ?? null,
      quotable: this.quotable(evaluation, zone.active, market.id, countryId),
      rate: rate ? { amount: rate.amount, origin: originOf(rate, names), tier: tierOf(rate) } : null,
      surcharge:
        surchargeTiers === null
          ? null
          : { amount: surchargeTier?.amount ?? 0, tier: surchargeTier ? { fromMinutes: surchargeTier.fromMinutes, toMinutes: surchargeTier.toMinutes } : null },
      commission: commission ? { amount: commission.amount, origin: originOf(commission, names), tier: tierOf(commission) } : null,
      vat: commission && vatAmount !== null ? { rateBps: vatRateBps, amount: vatAmount } : null,
      totalForGoalkeeper: commission && vatAmount !== null ? commission.amount + vatAmount : null,
      rules: {
        bookingWindowDays: rules.bookingWindowDays,
        minNoticeMinutes: rules.minNoticeMinutes,
        freeCancellationMinutes: rules.freeCancellationMinutes,
        travelBufferMinutes: rules.travelBufferMinutes,
      },
    };
    return { outcome: 'ok', preview };
  }

  /** An inactive zone never quotes; otherwise the quote's own verdict. */
  private quotable(evaluation: AreaQuoteResult, active: boolean, marketId: string, countryId: string | null): PricingPreview['quotable'] {
    if (!active) return { ok: false, outcome: 'zone_inactive', detail: DETAILS.zone_inactive, target: null };
    if (evaluation.outcome === 'priced') return { ok: true };
    return { ok: false, outcome: evaluation.outcome, detail: DETAILS[evaluation.outcome], target: targetOf(evaluation, marketId, countryId) };
  }
}

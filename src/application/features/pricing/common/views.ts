import { kindOf } from '../../../../domain/operatingBalance/commissionRule.js';
import type { CommissionKind } from '../../../../domain/operatingBalance/commissionSetting.js';
import { vatFor } from '../../../../domain/operatingBalance/vat.js';
import type { CommissionRecord, PriceRecord, RentalRateRecord } from './ports.js';

/**
 * Where a rate or commission points, resolved once per list: the country (and its currency) and,
 * below it, the anchor market and the zone. `valid: false` when the target no longer exists or the
 * market stopped being an anchor (seeded or old data).
 */
export interface PriceTarget {
  valid: boolean;
  countryId: string | null;
  countryName: string | null;
  currency: string | null;
  marketId: string | null;
  marketName: string | null;
  zoneId: string | null;
  zoneName: string | null;
  zoneActive: boolean | null;
}

function targetPart(target: PriceTarget) {
  return {
    currency: target.currency,
    countryId: target.countryId,
    countryName: target.countryName,
    marketId: target.marketId,
    marketName: target.marketName,
    zoneName: target.zoneName,
    zoneActive: target.zoneActive,
    targetValid: target.valid,
  };
}

function priceView<Scope extends string>(record: PriceRecord<Scope>, target: PriceTarget) {
  return {
    id: record.id,
    scope: record.scope,
    refId: record.refId,
    modality: record.modality,
    amount: record.amount,
    revision: record.revision,
    invalid: record.invalid,
    ...targetPart(target),
  };
}

export type RentalRateView = ReturnType<typeof rentalRateView>;
export type CommissionView = ReturnType<typeof commissionView>;

export function rentalRateView(record: RentalRateRecord, target: PriceTarget) {
  return { ...priceView(record, target), durationMinutes: record.durationMinutes };
}

/** A goalkeeper rule as the admin sees it (feature 033): whose it is and whether it still applies. */
export interface GoalkeeperRulePart {
  goalkeeper: { userId: string; name: string | null };
  validUntil: string | null;
  /** `YYYY-MM-DDTHH:mm` in the goalkeeper's market time zone; `null` = never expires. */
  validUntilLocal: string | null;
  timeZone: string | null;
  validity: 'active' | 'expired' | 'other_country';
}

/**
 * With the VAT a goalkeeper pays on top, computed like the operating balance does (never re-rounded
 * here) — only for a fixed rule: a percentage depends on the booking (feature 033).
 */
export function commissionView(record: CommissionRecord, target: PriceTarget, vatRateBps: number, goalkeeper: GoalkeeperRulePart | null = null) {
  const kind: CommissionKind = kindOf(record);
  const vatAmount = record.invalid || kind !== 'fixed' ? null : vatFor(record.fixedAmount, vatRateBps);
  return {
    id: record.id,
    scope: record.scope,
    refId: record.refId,
    modality: record.modality,
    fixedAmount: record.fixedAmount,
    percentBps: record.percentBps,
    kind,
    revision: record.revision,
    invalid: record.invalid,
    ...targetPart(target),
    vatRateBps,
    vatAmount,
    totalWithVat: vatAmount === null ? null : record.fixedAmount + vatAmount,
    ...(goalkeeper ?? {}),
  };
}

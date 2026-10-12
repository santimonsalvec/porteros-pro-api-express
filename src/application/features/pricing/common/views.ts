import { vatFor } from '../../../../domain/wallet/vat.js';
import type { CommissionRecord, PriceRecord, RentalRateRecord } from './ports.js';

/**
 * Where a rate or commission points, resolved once per list: the country (and its currency) and,
 * below it, the anchor city and the zone. `valid: false` when the target no longer exists or the
 * city stopped being an anchor (seeded or old data).
 */
export interface PriceTarget {
  valid: boolean;
  countryId: string | null;
  countryName: string | null;
  currency: string | null;
  cityId: string | null;
  cityName: string | null;
  zoneId: string | null;
  zoneName: string | null;
  zoneActive: boolean | null;
}

function priceView<Scope extends string>(record: PriceRecord<Scope>, target: PriceTarget) {
  return {
    id: record.id,
    scope: record.scope,
    refId: record.refId,
    modality: record.modality,
    level: record.level,
    amount: record.amount,
    revision: record.revision,
    invalid: record.invalid,
    currency: target.currency,
    countryId: target.countryId,
    countryName: target.countryName,
    cityId: target.cityId,
    cityName: target.cityName,
    zoneName: target.zoneName,
    zoneActive: target.zoneActive,
    targetValid: target.valid,
  };
}

export type RentalRateView = ReturnType<typeof rentalRateView>;
export type CommissionView = ReturnType<typeof commissionView>;

export function rentalRateView(record: RentalRateRecord, target: PriceTarget) {
  return { ...priceView(record, target), durationMinutes: record.durationMinutes };
}

/** With the VAT a goalkeeper pays on top, computed like the wallet does (never re-rounded here). */
export function commissionView(record: CommissionRecord, target: PriceTarget, vatRateBps: number) {
  const vatAmount = record.invalid ? null : vatFor(record.amount, vatRateBps);
  return {
    ...priceView(record, target),
    vatRateBps,
    vatAmount,
    totalWithVat: vatAmount === null ? null : record.amount + vatAmount,
  };
}

import { describe, expect, it } from 'vitest';
import { commissionView, rentalRateView, type PriceTarget } from '../../../../../../src/application/features/pricing/common/views.js';
import type { CommissionRecord, RentalRateRecord } from '../../../../../../src/application/features/pricing/common/ports.js';

const zoneTarget: PriceTarget = {
  valid: true,
  countryId: 'co',
  countryName: 'Colombia',
  currency: 'COP',
  marketId: 'med',
  marketName: 'Medellín',
  zoneId: 'bello',
  zoneName: 'Bello',
  zoneActive: true,
};

const rate: RentalRateRecord = {
  id: 'r1',
  scope: 'zone',
  refId: 'bello',
  durationMinutes: 90,
  modality: null,
  amount: 60000,
  revision: 2,
  invalid: false,
};

const commission: CommissionRecord = { id: 'c1', scope: 'country', refId: 'co', modality: 'futbol_11', fixedAmount: 7000, percentBps: 0, countryId: null, validUntil: null, revision: 0, invalid: false };
const countryTarget: PriceTarget = { ...zoneTarget, marketId: null, marketName: null, zoneId: null, zoneName: null, zoneActive: null };

describe('rentalRateView', () => {
  it('joins the rate with its target', () => {
    expect(rentalRateView(rate, zoneTarget)).toEqual({
      id: 'r1',
      scope: 'zone',
      refId: 'bello',
      durationMinutes: 90,
      modality: null,
      amount: 60000,
      revision: 2,
      invalid: false,
      currency: 'COP',
      countryId: 'co',
      countryName: 'Colombia',
      marketId: 'med',
      marketName: 'Medellín',
      zoneName: 'Bello',
      zoneActive: true,
      targetValid: true,
    });
  });

  it('marks a rate whose target no longer exists', () => {
    const missing: PriceTarget = { ...countryTarget, valid: false, countryId: null, countryName: null, currency: null };
    expect(rentalRateView(rate, missing)).toMatchObject({ targetValid: false, currency: null, marketName: null });
  });
});

describe('commissionView', () => {
  it('adds the VAT and the total at the country rate', () => {
    expect(commissionView(commission, countryTarget, 1900)).toMatchObject({
      id: 'c1',
      fixedAmount: 7000,
      percentBps: 0,
      kind: 'fixed',
      currency: 'COP',
      vatRateBps: 1900,
      vatAmount: 1330,
      totalWithVat: 8330,
      targetValid: true,
    });
  });

  it('charges no VAT where none is configured', () => {
    expect(commissionView(commission, countryTarget, 0)).toMatchObject({ vatAmount: 0, totalWithVat: 7000 });
  });

  it('leaves the VAT empty for a stored amount the domain refuses', () => {
    expect(commissionView({ ...commission, fixedAmount: 70.5, invalid: true }, countryTarget, 1900)).toMatchObject({
      invalid: true,
      vatAmount: null,
      totalWithVat: null,
    });
  });

  it('leaves the VAT empty for a percent or mixed rule, since it depends on the booking (feature 033)', () => {
    expect(commissionView({ ...commission, fixedAmount: 0, percentBps: 1000 }, countryTarget, 1900)).toMatchObject({ kind: 'percent', vatAmount: null, totalWithVat: null });
    expect(commissionView({ ...commission, fixedAmount: 3000, percentBps: 1000 }, countryTarget, 1900)).toMatchObject({ kind: 'mixed', vatAmount: null, totalWithVat: null });
  });
});

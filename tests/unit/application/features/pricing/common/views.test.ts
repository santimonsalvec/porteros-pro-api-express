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
  level: null,
  amount: 60000,
  revision: 2,
  invalid: false,
};

const commission: CommissionRecord = { id: 'c1', scope: 'country', refId: 'co', modality: 'futbol_11', level: null, amount: 7000, revision: 0, invalid: false };
const countryTarget: PriceTarget = { ...zoneTarget, marketId: null, marketName: null, zoneId: null, zoneName: null, zoneActive: null };

describe('rentalRateView', () => {
  it('joins the rate with its target', () => {
    expect(rentalRateView(rate, zoneTarget)).toEqual({
      id: 'r1',
      scope: 'zone',
      refId: 'bello',
      durationMinutes: 90,
      modality: null,
      level: null,
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
      amount: 7000,
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
    expect(commissionView({ ...commission, amount: 70.5, invalid: true }, countryTarget, 1900)).toMatchObject({
      invalid: true,
      vatAmount: null,
      totalWithVat: null,
    });
  });
});

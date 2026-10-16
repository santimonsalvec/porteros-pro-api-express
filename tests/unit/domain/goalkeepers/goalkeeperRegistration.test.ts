import { describe, expect, it } from 'vitest';
import { billingFieldErrors, EMPTY_BILLING, isBillingComplete } from '../../../../src/domain/goalkeepers/billing.js';
import { GoalkeeperProfile } from '../../../../src/domain/goalkeepers/goalkeeperProfile.js';
import { GoalkeeperRegistration } from '../../../../src/domain/goalkeepers/goalkeeperRegistration.js';

describe('billing data (spec 031, FR-023)', () => {
  it('starts empty on a new registration and merges only what is sent', () => {
    const registration = GoalkeeperRegistration.createEmpty('reg-1', 'user-1');
    expect(registration.billing).toEqual(EMPTY_BILLING);

    registration.saveBilling({ cityId: 'city-rionegro' });
    registration.saveBilling({ address: 'Calle 10 # 20-30' });

    expect(registration.billing).toEqual({ cityId: 'city-rionegro', address: 'Calle 10 # 20-30', addressComplement: null });
  });

  it('needs a municipality and an address to be complete', () => {
    expect(isBillingComplete(EMPTY_BILLING)).toBe(false);
    expect(isBillingComplete({ cityId: 'c', address: null, addressComplement: 'Apto 1' })).toBe(false);
    expect(isBillingComplete({ cityId: 'c', address: 'Calle 10', addressComplement: null })).toBe(true);
  });

  it.each([
    [{ address: 'Cl 1' }, { address: 'invalid_length' }],
    [{ address: 'x'.repeat(121) }, { address: 'invalid_length' }],
    [{ address: '   Calle 10   ' }, {}],
    [{ addressComplement: 'x'.repeat(81) }, { addressComplement: 'invalid_length' }],
    [{ addressComplement: '' }, {}],
    [{ cityId: '' }, { cityId: 'required' }],
  ])('checks %o', (fields, errors) => {
    expect(billingFieldErrors(fields)).toEqual(errors);
  });

  it('is copied to the profile on activation', () => {
    const registration = GoalkeeperRegistration.createEmpty('reg-1', 'user-1');
    registration.saveIdentification({
      documentType: 'CC',
      documentNumber: '123',
      issueDate: new Date('2015-01-01'),
      birthDate: new Date('1995-01-01'),
      documentPhotoAId: 'a',
      documentPhotoBId: 'b',
    });
    registration.savePhysicalData({ heightCm: 180, weightKg: 80 });
    registration.saveAvailability({ marketId: 'm', zoneIds: ['z'] });
    registration.saveBilling({ cityId: 'city-rionegro', address: 'Calle 10 # 20-30', addressComplement: 'Casa 2' });

    const profile = GoalkeeperProfile.createFromRegistration('p-1', registration);

    expect(profile.billing).toEqual({ cityId: 'city-rionegro', address: 'Calle 10 # 20-30', addressComplement: 'Casa 2' });
    expect(profile.billing).not.toBe(registration.billing);
  });
});

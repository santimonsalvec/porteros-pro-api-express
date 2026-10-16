import { describe, expect, it } from 'vitest';
import { completeSections, fieldStatus, registrationStep } from '../../../../../../src/application/features/goalkeepers/common/registrationStep.js';
import { GoalkeeperRegistration } from '../../../../../../src/domain/goalkeepers/goalkeeperRegistration.js';

function draft() {
  return GoalkeeperRegistration.createEmpty('r1', 'u1');
}
function withIdentification() {
  const registration = draft();
  registration.saveIdentification({ documentType: 'CC', documentNumber: '1020304050', issueDate: new Date('2016-01-01'), birthDate: new Date('1998-01-01') });
  registration.identification.documentPhotoAId = 'a';
  registration.identification.documentPhotoBId = 'b';
  return registration;
}

describe('where a registration in progress stands (admin spec 005, US7)', () => {
  it('is the first incomplete section, in the order of the app, or ready', () => {
    expect(registrationStep(draft())).toBe('identification');
    const identified = withIdentification();
    expect(registrationStep(identified)).toBe('physicalData');
    identified.physicalData = { heightCm: 180, weightKg: 80 };
    expect(registrationStep(identified)).toBe('availability');
    identified.availability = { marketId: 'med', zoneIds: ['z1'] };
    expect(registrationStep(identified)).toBe('billing');
    identified.saveBilling({ cityId: 'mun-med', address: 'Calle 10 # 20-30' });
    expect(registrationStep(identified)).toBe('ready');
    expect(completeSections(identified)).toEqual(['identification', 'physicalData', 'availability', 'billing']);
  });

  it('lists which sections are complete even out of order', () => {
    const registration = draft();
    registration.physicalData = { heightCm: 180, weightKg: 80 };
    expect(registrationStep(registration)).toBe('identification');
    expect(completeSections(registration)).toEqual(['physicalData']);
  });

  it('tells complete or missing per field, never the document values', () => {
    const registration = withIdentification();
    registration.physicalData = { heightCm: null, weightKg: 78 };

    const status = fieldStatus(registration);

    expect(status).toEqual({
      identification: { documentType: 'complete', documentNumber: 'complete', issueDate: 'complete', birthDate: 'complete', documentPhotoA: 'complete', documentPhotoB: 'complete' },
      physicalData: { heightCm: 'missing', weightKg: 'complete' },
    });
    expect(JSON.stringify(status)).not.toContain('1020304050');
  });
});

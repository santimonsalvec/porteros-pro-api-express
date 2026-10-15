import { describe, expect, it } from 'vitest';
import { GoalkeeperProfile } from '../../../../src/domain/goalkeepers/goalkeeperProfile.js';
import { GoalkeeperRegistration } from '../../../../src/domain/goalkeepers/goalkeeperRegistration.js';
import { approveValidation, PENDING_VETTING } from '../../../../src/domain/goalkeepers/vetting.js';

const params = {
  id: 'profile-1',
  userId: 'user-1',
  documentType: 'CC',
  documentNumber: '123',
  issueDate: new Date('2015-01-01'),
  birthDate: new Date('1995-01-01'),
  documentPhotoAId: 'img-a',
  documentPhotoBId: 'img-b',
  heightCm: 185,
  weightKg: 80,
  cityId: 'city-cali',
  zoneIds: ['zone-1'],
  activatedAt: new Date('2026-09-01'),
};

describe('GoalkeeperProfile vetting (admin spec 030)', () => {
  it('is pending when no vetting is given', () => {
    const profile = new GoalkeeperProfile(params);

    expect(profile.vetting).toEqual(PENDING_VETTING);
    expect(profile.tier).toBe('unvalidated');
  });

  it('derives the tier from the vetting it carries', () => {
    const profile = new GoalkeeperProfile({ ...params, vetting: approveValidation(PENDING_VETTING, 'staff-1', new Date()) });

    expect(profile.tier).toBe('validated');
  });

  it('a goalkeeper activated from a registration starts pending', () => {
    const registration = GoalkeeperRegistration.createEmpty('reg-1', 'user-1');
    registration.saveIdentification({
      documentType: 'CC',
      documentNumber: '123',
      issueDate: new Date('2015-01-01'),
      birthDate: new Date('1995-01-01'),
      documentPhotoAId: 'img-a',
      documentPhotoBId: 'img-b',
    });
    registration.savePhysicalData({ heightCm: 185, weightKg: 80 });
    registration.saveAvailability({ cityId: 'city-cali', zoneIds: ['zone-1'] });

    const profile = GoalkeeperProfile.createFromRegistration('profile-1', registration);

    expect(profile.tier).toBe('unvalidated');
    expect(profile.vetting.revision).toBe(0);
  });
});

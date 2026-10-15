import { describe, expect, it } from 'vitest';
import { GetGoalkeeperRegistrationQuery } from '../../../../../src/application/features/goalkeepers/queries/getGoalkeeperRegistration/getGoalkeeperRegistrationQuery.js';
import { GetGoalkeeperRegistrationQueryHandler } from '../../../../../src/application/features/goalkeepers/queries/getGoalkeeperRegistration/getGoalkeeperRegistrationQueryHandler.js';
import { FakeGoalkeeperRegistrationRepository } from '../../../../fakes/fakeGoalkeeperRegistrationRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { GoalkeeperRegistration } from '../../../../../src/domain/goalkeepers/goalkeeperRegistration.js';
import { GoalkeeperProfile } from '../../../../../src/domain/goalkeepers/goalkeeperProfile.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { Region } from '../../../../../src/domain/locations/region.js';
import { BackgroundCheck } from '../../../../../src/domain/goalkeepers/backgroundCheck.js';
import { PENDING_VETTING, rejectValidation } from '../../../../../src/domain/goalkeepers/vetting.js';
import { FakeBackgroundCheckRepository } from '../../../../fakes/fakeBackgroundCheckRepository.js';
import { VALIDATED_VETTING, VERIFIED_VETTING } from '../../../../fixtures/vettingFixtures.js';

function buildHandler() {
  const repository = new FakeGoalkeeperRegistrationRepository();
  const profileRepository = new FakeGoalkeeperProfileRepository();
  const cityRepository = new FakeCityRepository();
  const regionRepository = new FakeRegionRepository();
  regionRepository.seed(new Region({ id: 'region-antioquia', name: 'Antioquia' }));
  cityRepository.seed(new City({ id: 'city-envigado', name: 'Envigado', regionId: 'region-antioquia', zoneCityId: 'city-medellin' }));
  cityRepository.seed(new City({ id: 'city-orphan', name: 'Orphan', regionId: 'region-missing', zoneCityId: null }));
  return {
    repository,
    profileRepository,
    handler: new GetGoalkeeperRegistrationQueryHandler(repository, profileRepository, cityRepository, regionRepository),
  };
}

function activeProfile(userId: string, overrides: Partial<ConstructorParameters<typeof GoalkeeperProfile>[0]> = {}) {
  return new GoalkeeperProfile({
    id: `gp-${userId}`,
    userId,
    documentType: 'cedula_ciudadania',
    documentNumber: '123',
    issueDate: new Date('2013-01-01'),
    birthDate: new Date('1995-01-01'),
    documentPhotoAId: 'img-a',
    documentPhotoBId: 'img-b',
    heightCm: 185,
    weightKg: 78,
    cityId: 'city-envigado',
    zoneIds: ['zone-bello'],
    activatedAt: new Date('2026-08-30'),
    ...overrides,
  });
}

describe('GetGoalkeeperRegistrationQueryHandler', () => {
  it('synthesizes not_started with no repository write when nothing was ever saved', async () => {
    const { handler, repository } = buildHandler();

    const result = await handler.handle(new GetGoalkeeperRegistrationQuery('user-1'));

    expect(result.registration.status).toBe('not_started');
    expect(result.registration.sections.identification.complete).toBe(false);
    expect(result.registration.heightCm).toBeNull();
    expect(result.registration.cityId).toBeNull();
    expect(result.registration.city).toBeNull();
    expect(result.registration.serviceZoneIds).toEqual([]);
    expect(await repository.getByUserId('user-1')).toBeNull();
  });

  it('round-trips a previously saved city and service zones, marking availability complete', async () => {
    const { handler, repository } = buildHandler();
    const registration = GoalkeeperRegistration.createEmpty('reg-3', 'user-3');
    registration.saveAvailability({ cityId: 'city-envigado', zoneIds: ['zone-bello', 'zone-copacabana'] });
    repository.seed(registration);

    const result = await handler.handle(new GetGoalkeeperRegistrationQuery('user-3'));

    expect(result.registration.cityId).toBe('city-envigado');
    expect(result.registration.serviceZoneIds).toEqual(['zone-bello', 'zone-copacabana']);
    expect(result.registration.sections.availability.complete).toBe(true);
  });

  it('returns the stored values and computed sections for an existing registration', async () => {
    const { handler, repository } = buildHandler();
    const registration = GoalkeeperRegistration.createEmpty('reg-1', 'user-2');
    registration.savePhysicalData({ heightCm: 185, weightKg: 78 });
    repository.seed(registration);

    const result = await handler.handle(new GetGoalkeeperRegistrationQuery('user-2'));

    expect(result.registration.status).toBe('in_progress');
    expect(result.registration.heightCm).toBe(185);
    expect(result.registration.sections.physicalData.complete).toBe(true);
    expect(result.registration.sections.identification.complete).toBe(false);
  });

  it("includes the saved city's name and region name", async () => {
    const { handler, repository } = buildHandler();
    const registration = GoalkeeperRegistration.createEmpty('reg-4', 'user-4');
    registration.saveAvailability({ cityId: 'city-envigado', zoneIds: ['zone-bello'] });
    repository.seed(registration);

    const result = await handler.handle(new GetGoalkeeperRegistrationQuery('user-4'));

    expect(result.registration.city).toEqual({ id: 'city-envigado', name: 'Envigado', region: 'Antioquia' });
  });

  it('returns city: null when the saved city no longer resolves, and an empty region name when only the region is gone', async () => {
    const { handler, repository } = buildHandler();
    const gone = GoalkeeperRegistration.createEmpty('reg-5', 'user-5');
    gone.saveAvailability({ cityId: 'city-deleted', zoneIds: ['zone-bello'] });
    repository.seed(gone);
    const orphan = GoalkeeperRegistration.createEmpty('reg-6', 'user-6');
    orphan.saveAvailability({ cityId: 'city-orphan', zoneIds: ['zone-bello'] });
    repository.seed(orphan);

    const goneResult = await handler.handle(new GetGoalkeeperRegistrationQuery('user-5'));
    const orphanResult = await handler.handle(new GetGoalkeeperRegistrationQuery('user-6'));

    expect(goneResult.registration.cityId).toBe('city-deleted');
    expect(goneResult.registration.city).toBeNull();
    expect(orphanResult.registration.city).toEqual({ id: 'city-orphan', name: 'Orphan', region: '' });
  });

  describe('for an active goalkeeper', () => {
    it('reads the current values from the profile, not the registration locked at activation', async () => {
      const { handler, repository, profileRepository } = buildHandler();
      const locked = GoalkeeperRegistration.createEmpty('reg-7', 'user-7');
      locked.savePhysicalData({ heightCm: 185, weightKg: 78 });
      locked.saveAvailability({ cityId: 'city-orphan', zoneIds: ['zone-old'] });
      locked.activate();
      repository.seed(locked);
      profileRepository.seed(activeProfile('user-7', { heightCm: 190, weightKg: 82, cityId: 'city-envigado', zoneIds: ['zone-bello', 'zone-copacabana'] }));

      const result = await handler.handle(new GetGoalkeeperRegistrationQuery('user-7'));

      expect(result.registration.status).toBe('active');
      expect(result.registration.heightCm).toBe(190);
      expect(result.registration.weightKg).toBe(82);
      expect(result.registration.cityId).toBe('city-envigado');
      expect(result.registration.serviceZoneIds).toEqual(['zone-bello', 'zone-copacabana']);
      expect(result.registration.city).toEqual({ id: 'city-envigado', name: 'Envigado', region: 'Antioquia' });
      expect(result.registration.sections).toEqual({
        identification: { complete: true },
        physicalData: { complete: true },
        availability: { complete: true },
      });
    });

    it('still exposes identification data and the photo-submitted flags, never raw photo ids', async () => {
      const { handler, profileRepository } = buildHandler();
      profileRepository.seed(activeProfile('user-8'));

      const result = await handler.handle(new GetGoalkeeperRegistrationQuery('user-8'));

      expect(result.registration).toMatchObject({
        documentType: 'cedula_ciudadania',
        documentNumber: '123',
        issueDate: '2013-01-01',
        birthDate: '1995-01-01',
        documentPhotoASubmitted: true,
        documentPhotoBSubmitted: true,
      });
      expect(JSON.stringify(result.registration)).not.toContain('img-a');
    });
  });
});

describe('GetGoalkeeperRegistrationQueryHandler — vetting (admin spec 030, contracts A1)', () => {
  const NOW = new Date('2026-10-15T15:00:00.000Z');

  function withChecks() {
    const built = buildHandler();
    const checks = new FakeBackgroundCheckRepository();
    const handler = new GetGoalkeeperRegistrationQueryHandler(
      built.repository,
      built.profileRepository,
      new FakeCityRepository(),
      new FakeRegionRepository(),
      { checks, clock: { now: () => NOW } },
    );
    return { ...built, checks, handler };
  }

  it('tells an active goalkeeper their tier, the last rejection and how their documents stand', async () => {
    const { profileRepository, checks, handler } = withChecks();
    profileRepository.seed(activeProfile('gk-1', { vetting: rejectValidation(PENDING_VETTING, 'staff-1', NOW, 'Foto ilegible') }));
    checks.seed(BackgroundCheck.upload('bc-1', 'gk-1', 'img-1', NOW));
    checks.seed(BackgroundCheck.upload('bc-2', 'gk-1', 'img-2', NOW).reject('staff-1', NOW, 'Ilegible'));
    checks.seed(BackgroundCheck.upload('bc-3', 'gk-1', 'img-3', NOW).approve('staff-1', new Date('2025-01-01'), new Date('2025-06-01')));

    const { registration } = await handler.handle(new GetGoalkeeperRegistrationQuery('gk-1'));

    expect(registration.vetting).toEqual({
      tier: 'unvalidated',
      rejection: { reason: 'Foto ilegible', at: NOW.toISOString() },
      backgroundChecks: { pending: 1, approved: 0, rejected: 1, expired: 1 },
      unverifiedDiscount: null,
    });
  });

  it('never shows who decided, nor how a goalkeeper was verified', async () => {
    const { profileRepository, handler } = withChecks();
    profileRepository.seed(activeProfile('gk-1', { vetting: VERIFIED_VETTING }));

    const { registration } = await handler.handle(new GetGoalkeeperRegistrationQuery('gk-1'));

    expect(registration.vetting).toEqual({ tier: 'verified', rejection: null, backgroundChecks: { pending: 0, approved: 0, rejected: 0, expired: 0 }, unverifiedDiscount: null });
    expect(JSON.stringify(registration)).not.toMatch(/staff|practice|method/);
  });

  it('has no vetting before activation', async () => {
    const { handler } = withChecks();

    expect((await handler.handle(new GetGoalkeeperRegistrationQuery('newcomer'))).registration.vetting).toBeUndefined();
  });

  it('tells a validated goalkeeper without the seal how much less they earn across their zones', async () => {
    const built = buildHandler();
    const terms = new Map([
      ['zone-bello', { discountBps: 1000, verifiedPriorityMinutes: 15 }],
      ['zone-copacabana', { discountBps: 1500, verifiedPriorityMinutes: 15 }],
    ]);
    const handler = new GetGoalkeeperRegistrationQueryHandler(built.repository, built.profileRepository, new FakeCityRepository(), new FakeRegionRepository(), {
      checks: new FakeBackgroundCheckRepository(),
      clock: { now: () => new Date('2026-10-15T15:00:00.000Z') },
      discounts: { forZones: async (zoneIds) => new Map(zoneIds.map((id) => [id, terms.get(id) ?? { discountBps: 0, verifiedPriorityMinutes: 15 }])) },
    });
    built.profileRepository.seed(activeProfile('gk-1', { zoneIds: ['zone-bello', 'zone-copacabana'], vetting: VALIDATED_VETTING }));
    built.profileRepository.seed(activeProfile('gk-2', { zoneIds: ['zone-nothing'], vetting: VALIDATED_VETTING }));
    built.profileRepository.seed(activeProfile('gk-3', { zoneIds: ['zone-bello'], vetting: VERIFIED_VETTING }));

    expect((await handler.handle(new GetGoalkeeperRegistrationQuery('gk-1'))).registration.vetting?.unverifiedDiscount).toEqual({ minBps: 1000, maxBps: 1500 });
    expect((await handler.handle(new GetGoalkeeperRegistrationQuery('gk-2'))).registration.vetting?.unverifiedDiscount).toBeNull();
    expect((await handler.handle(new GetGoalkeeperRegistrationQuery('gk-3'))).registration.vetting?.unverifiedDiscount).toBeNull();
  });
});

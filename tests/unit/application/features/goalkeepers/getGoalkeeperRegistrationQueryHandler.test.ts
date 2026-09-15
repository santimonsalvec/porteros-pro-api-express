import { describe, expect, it } from 'vitest';
import { GetGoalkeeperRegistrationQuery } from '../../../../../src/application/features/goalkeepers/queries/getGoalkeeperRegistration/getGoalkeeperRegistrationQuery.js';
import { GetGoalkeeperRegistrationQueryHandler } from '../../../../../src/application/features/goalkeepers/queries/getGoalkeeperRegistration/getGoalkeeperRegistrationQueryHandler.js';
import { FakeGoalkeeperRegistrationRepository } from '../../../../fakes/fakeGoalkeeperRegistrationRepository.js';
import { GoalkeeperRegistration } from '../../../../../src/domain/goalkeepers/goalkeeperRegistration.js';

describe('GetGoalkeeperRegistrationQueryHandler', () => {
  it('synthesizes not_started with no repository write when nothing was ever saved', async () => {
    const repository = new FakeGoalkeeperRegistrationRepository();
    const handler = new GetGoalkeeperRegistrationQueryHandler(repository);

    const result = await handler.handle(new GetGoalkeeperRegistrationQuery('user-1'));

    expect(result.registration.status).toBe('not_started');
    expect(result.registration.sections.identification.complete).toBe(false);
    expect(result.registration.heightCm).toBeNull();
    expect(result.registration.cityId).toBeNull();
    expect(result.registration.serviceZoneIds).toEqual([]);
    expect(await repository.getByUserId('user-1')).toBeNull();
  });

  it('round-trips a previously saved city and service zones, marking availability complete', async () => {
    const repository = new FakeGoalkeeperRegistrationRepository();
    const registration = GoalkeeperRegistration.createEmpty('reg-3', 'user-3');
    registration.saveAvailability({ cityId: 'city-envigado', zoneIds: ['zone-bello', 'zone-copacabana'] });
    repository.seed(registration);
    const handler = new GetGoalkeeperRegistrationQueryHandler(repository);

    const result = await handler.handle(new GetGoalkeeperRegistrationQuery('user-3'));

    expect(result.registration.cityId).toBe('city-envigado');
    expect(result.registration.serviceZoneIds).toEqual(['zone-bello', 'zone-copacabana']);
    expect(result.registration.sections.availability.complete).toBe(true);
  });

  it('returns the stored values and computed sections for an existing registration', async () => {
    const repository = new FakeGoalkeeperRegistrationRepository();
    const registration = GoalkeeperRegistration.createEmpty('reg-1', 'user-2');
    registration.savePhysicalData({ heightCm: 185, weightKg: 78 });
    repository.seed(registration);
    const handler = new GetGoalkeeperRegistrationQueryHandler(repository);

    const result = await handler.handle(new GetGoalkeeperRegistrationQuery('user-2'));

    expect(result.registration.status).toBe('in_progress');
    expect(result.registration.heightCm).toBe(185);
    expect(result.registration.sections.physicalData.complete).toBe(true);
    expect(result.registration.sections.identification.complete).toBe(false);
  });
});

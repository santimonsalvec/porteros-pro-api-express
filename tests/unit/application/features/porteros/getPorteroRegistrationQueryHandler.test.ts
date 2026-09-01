import { describe, expect, it } from 'vitest';
import { GetPorteroRegistrationQuery } from '../../../../../src/application/features/porteros/queries/getPorteroRegistration/getPorteroRegistrationQuery.js';
import { GetPorteroRegistrationQueryHandler } from '../../../../../src/application/features/porteros/queries/getPorteroRegistration/getPorteroRegistrationQueryHandler.js';
import { FakePorteroRegistrationRepository } from '../../../../fakes/fakePorteroRegistrationRepository.js';
import { PorteroRegistration } from '../../../../../src/domain/porteros/porteroRegistration.js';

describe('GetPorteroRegistrationQueryHandler', () => {
  it('synthesizes not_started with no repository write when nothing was ever saved', async () => {
    const repository = new FakePorteroRegistrationRepository();
    const handler = new GetPorteroRegistrationQueryHandler(repository);

    const result = await handler.handle(new GetPorteroRegistrationQuery('user-1'));

    expect(result.registration.status).toBe('not_started');
    expect(result.registration.sections.identification.complete).toBe(false);
    expect(result.registration.heightCm).toBeNull();
    expect(await repository.getByUserId('user-1')).toBeNull();
  });

  it('returns the stored values and computed sections for an existing registration', async () => {
    const repository = new FakePorteroRegistrationRepository();
    const registration = PorteroRegistration.createEmpty('reg-1', 'user-2');
    registration.savePhysicalData({ heightCm: 185, weightKg: 78 });
    repository.seed(registration);
    const handler = new GetPorteroRegistrationQueryHandler(repository);

    const result = await handler.handle(new GetPorteroRegistrationQuery('user-2'));

    expect(result.registration.status).toBe('in_progress');
    expect(result.registration.heightCm).toBe(185);
    expect(result.registration.sections.physicalData.complete).toBe(true);
    expect(result.registration.sections.identification.complete).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { ActivateGoalkeeperCommand } from '../../../../../src/application/features/goalkeepers/commands/activateGoalkeeper/activateGoalkeeperCommand.js';
import { ActivateGoalkeeperCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/activateGoalkeeper/activateGoalkeeperCommandHandler.js';
import { FakeGoalkeeperRegistrationRepository } from '../../../../fakes/fakeGoalkeeperRegistrationRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { GoalkeeperRegistration } from '../../../../../src/domain/goalkeepers/goalkeeperRegistration.js';

function buildHandler() {
  const registrationRepository = new FakeGoalkeeperRegistrationRepository();
  const profileRepository = new FakeGoalkeeperProfileRepository();
  let idCounter = 0;
  const idGenerator = { newId: (): string => `profile-${++idCounter}` };
  const handler = new ActivateGoalkeeperCommandHandler(registrationRepository, profileRepository, idGenerator);
  return { registrationRepository, profileRepository, handler };
}

function completeRegistration(id: string, userId: string): GoalkeeperRegistration {
  const registration = GoalkeeperRegistration.createEmpty(id, userId);
  registration.saveIdentification({
    documentType: 'cedula_ciudadania',
    documentNumber: '123',
    issueDate: new Date('2013-01-01'),
    birthDate: new Date('1995-01-01'),
  });
  registration.setDocumentPhoto('A', 'img-a');
  registration.setDocumentPhoto('B', 'img-b');
  registration.savePhysicalData({ heightCm: 185, weightKg: 78 });
  registration.saveLocation({ latitude: 6.2, longitude: -75.5, city: 'Medellín', state: 'Antioquia', country: 'CO' });
  registration.saveAvailability({ radiusKm: 25 });
  return registration;
}

describe('ActivateGoalkeeperCommandHandler', () => {
  it('lists every missing section when nothing was ever saved', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new ActivateGoalkeeperCommand('user-1'));

    expect(result.outcome).toBe('incomplete');
    expect(result.missingSections).toEqual(
      expect.arrayContaining(['identification', 'physicalData', 'location', 'availability']),
    );
  });

  it('lists only the sections still incomplete', async () => {
    const { handler, registrationRepository } = buildHandler();
    const registration = GoalkeeperRegistration.createEmpty('reg-1', 'user-2');
    registration.savePhysicalData({ heightCm: 185, weightKg: 78 });
    registrationRepository.seed(registration);

    const result = await handler.handle(new ActivateGoalkeeperCommand('user-2'));

    expect(result.outcome).toBe('incomplete');
    expect(result.missingSections).not.toContain('physicalData');
    expect(result.missingSections).toContain('availability');
  });

  it('creates a GoalkeeperProfile and locks the registration on success', async () => {
    const { handler, registrationRepository, profileRepository } = buildHandler();
    registrationRepository.seed(completeRegistration('reg-1', 'user-3'));

    const result = await handler.handle(new ActivateGoalkeeperCommand('user-3'));

    expect(result.outcome).toBe('success');
    expect(result.registration?.status).toBe('active');
    const profile = await profileRepository.getByUserId('user-3');
    expect(profile?.documentNumber).toBe('123');
    const registration = await registrationRepository.getByUserId('user-3');
    expect(registration?.status).toBe('active');
    expect(registration?.activatedAt).not.toBeNull();
  });

  it('rejects a second activation attempt', async () => {
    const { handler, registrationRepository } = buildHandler();
    const registration = completeRegistration('reg-1', 'user-4');
    registration.activate();
    registrationRepository.seed(registration);

    const result = await handler.handle(new ActivateGoalkeeperCommand('user-4'));

    expect(result.outcome).toBe('already_active');
  });
});

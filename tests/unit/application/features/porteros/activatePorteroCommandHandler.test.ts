import { describe, expect, it } from 'vitest';
import { ActivatePorteroCommand } from '../../../../../src/application/features/porteros/commands/activatePortero/activatePorteroCommand.js';
import { ActivatePorteroCommandHandler } from '../../../../../src/application/features/porteros/commands/activatePortero/activatePorteroCommandHandler.js';
import { FakePorteroRegistrationRepository } from '../../../../fakes/fakePorteroRegistrationRepository.js';
import { FakePorteroProfileRepository } from '../../../../fakes/fakePorteroProfileRepository.js';
import { PorteroRegistration } from '../../../../../src/domain/porteros/porteroRegistration.js';

function buildHandler() {
  const registrationRepository = new FakePorteroRegistrationRepository();
  const profileRepository = new FakePorteroProfileRepository();
  let idCounter = 0;
  const idGenerator = { newId: (): string => `profile-${++idCounter}` };
  const handler = new ActivatePorteroCommandHandler(registrationRepository, profileRepository, idGenerator);
  return { registrationRepository, profileRepository, handler };
}

function completeRegistration(id: string, userId: string): PorteroRegistration {
  const registration = PorteroRegistration.createEmpty(id, userId);
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

describe('ActivatePorteroCommandHandler', () => {
  it('lists every missing section when nothing was ever saved', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new ActivatePorteroCommand('user-1'));

    expect(result.outcome).toBe('incomplete');
    expect(result.missingSections).toEqual(
      expect.arrayContaining(['identification', 'physicalData', 'location', 'availability']),
    );
  });

  it('lists only the sections still incomplete', async () => {
    const { handler, registrationRepository } = buildHandler();
    const registration = PorteroRegistration.createEmpty('reg-1', 'user-2');
    registration.savePhysicalData({ heightCm: 185, weightKg: 78 });
    registrationRepository.seed(registration);

    const result = await handler.handle(new ActivatePorteroCommand('user-2'));

    expect(result.outcome).toBe('incomplete');
    expect(result.missingSections).not.toContain('physicalData');
    expect(result.missingSections).toContain('availability');
  });

  it('creates a PorteroProfile and locks the registration on success', async () => {
    const { handler, registrationRepository, profileRepository } = buildHandler();
    registrationRepository.seed(completeRegistration('reg-1', 'user-3'));

    const result = await handler.handle(new ActivatePorteroCommand('user-3'));

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

    const result = await handler.handle(new ActivatePorteroCommand('user-4'));

    expect(result.outcome).toBe('already_active');
  });
});

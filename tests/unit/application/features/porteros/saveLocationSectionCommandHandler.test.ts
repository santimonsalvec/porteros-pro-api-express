import { describe, expect, it } from 'vitest';
import { SaveLocationSectionCommand } from '../../../../../src/application/features/porteros/commands/saveLocationSection/saveLocationSectionCommand.js';
import { SaveLocationSectionCommandHandler } from '../../../../../src/application/features/porteros/commands/saveLocationSection/saveLocationSectionCommandHandler.js';
import { FakePorteroRegistrationRepository } from '../../../../fakes/fakePorteroRegistrationRepository.js';
import { PorteroRegistration } from '../../../../../src/domain/porteros/porteroRegistration.js';

function buildHandler() {
  const repository = new FakePorteroRegistrationRepository();
  let idCounter = 0;
  const idGenerator = { newId: (): string => `reg-${++idCounter}` };
  return { repository, handler: new SaveLocationSectionCommandHandler(repository, idGenerator) };
}

describe('SaveLocationSectionCommandHandler', () => {
  it('saves the full location, marking the section complete, neighborhood optional', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(
      new SaveLocationSectionCommand('user-1', 6.244, -75.581, 'Medellín', 'Antioquia', 'CO'),
    );

    expect(result.outcome).toBe('success');
    expect(result.registration?.sections.location.complete).toBe(true);
    expect(result.registration?.neighborhood).toBeNull();
  });

  it('stores formattedAddress but never echoes it back in the response', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(
      new SaveLocationSectionCommand(
        'user-1',
        6.244,
        -75.581,
        'Medellín',
        'Antioquia',
        'CO',
        'Laureles',
        'Cra. 70 # 44-12, Medellín',
      ),
    );

    expect(result.registration).not.toHaveProperty('formattedAddress');
  });

  it('rejects an out-of-range latitude', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new SaveLocationSectionCommand('user-1', 999));

    expect(result.outcome).toBe('validation_failed');
    expect(result.fieldErrors?.latitude).toBeTruthy();
  });

  it('rejects an empty city', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new SaveLocationSectionCommand('user-1', 6.2, -75.5, '  '));

    expect(result.outcome).toBe('validation_failed');
    expect(result.fieldErrors?.city).toBeTruthy();
  });

  it('rejects any change once active', async () => {
    const { handler, repository } = buildHandler();
    const active = PorteroRegistration.createEmpty('reg-active', 'user-2');
    active.activate();
    repository.seed(active);

    const result = await handler.handle(new SaveLocationSectionCommand('user-2', 6.2, -75.5, 'Medellín'));

    expect(result.outcome).toBe('already_active');
  });
});

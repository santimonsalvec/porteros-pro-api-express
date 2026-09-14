import { describe, expect, it } from 'vitest';
import { SaveAvailabilitySectionCommand } from '../../../../../src/application/features/goalkeepers/commands/saveAvailabilitySection/saveAvailabilitySectionCommand.js';
import { SaveAvailabilitySectionCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/saveAvailabilitySection/saveAvailabilitySectionCommandHandler.js';
import { FakeGoalkeeperRegistrationRepository } from '../../../../fakes/fakeGoalkeeperRegistrationRepository.js';
import { GoalkeeperRegistration } from '../../../../../src/domain/goalkeepers/goalkeeperRegistration.js';

function buildHandler() {
  const repository = new FakeGoalkeeperRegistrationRepository();
  let idCounter = 0;
  const idGenerator = { newId: (): string => `reg-${++idCounter}` };
  return { repository, handler: new SaveAvailabilitySectionCommandHandler(repository, idGenerator) };
}

describe('SaveAvailabilitySectionCommandHandler', () => {
  it('saves a valid radius, marking the section complete', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new SaveAvailabilitySectionCommand('user-1', 25));

    expect(result.outcome).toBe('success');
    expect(result.registration?.sections.availability.complete).toBe(true);
    expect(result.registration?.radiusKm).toBe(25);
  });

  it('rejects a radius below the minimum', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new SaveAvailabilitySectionCommand('user-1', 5));

    expect(result.outcome).toBe('validation_failed');
  });

  it('rejects a non-integer radius', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new SaveAvailabilitySectionCommand('user-1', 25.5));

    expect(result.outcome).toBe('validation_failed');
  });

  it('rejects any change once active', async () => {
    const { handler, repository } = buildHandler();
    const active = GoalkeeperRegistration.createEmpty('reg-active', 'user-2');
    active.activate();
    repository.seed(active);

    const result = await handler.handle(new SaveAvailabilitySectionCommand('user-2', 25));

    expect(result.outcome).toBe('already_active');
  });
});

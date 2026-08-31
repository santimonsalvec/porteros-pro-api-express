import { describe, expect, it } from 'vitest';
import { SavePhysicalDataSectionCommand } from '../../../../../src/application/features/porteros/commands/savePhysicalDataSection/savePhysicalDataSectionCommand.js';
import { SavePhysicalDataSectionCommandHandler } from '../../../../../src/application/features/porteros/commands/savePhysicalDataSection/savePhysicalDataSectionCommandHandler.js';
import { FakePorteroRegistrationRepository } from '../../../../fakes/fakePorteroRegistrationRepository.js';
import { PorteroRegistration } from '../../../../../src/domain/porteros/porteroRegistration.js';

function buildHandler() {
  const repository = new FakePorteroRegistrationRepository();
  let idCounter = 0;
  const idGenerator = { newId: (): string => `reg-${++idCounter}` };
  return { repository, handler: new SavePhysicalDataSectionCommandHandler(repository, idGenerator) };
}

describe('SavePhysicalDataSectionCommandHandler', () => {
  it('saves height and weight, marking the section complete', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new SavePhysicalDataSectionCommand('user-1', 185, 78));

    expect(result.outcome).toBe('success');
    expect(result.registration?.sections.physicalData.complete).toBe(true);
  });

  it('merges a single field without disturbing the other', async () => {
    const { handler, repository } = buildHandler();
    const existing = PorteroRegistration.createEmpty('reg-1', 'user-2');
    existing.savePhysicalData({ heightCm: 180, weightKg: 75 });
    repository.seed(existing);

    const result = await handler.handle(new SavePhysicalDataSectionCommand('user-2', 190));

    expect(result.registration?.heightCm).toBe(190);
    expect(result.registration?.weightKg).toBe(75);
  });

  it('rejects an out-of-range height', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new SavePhysicalDataSectionCommand('user-1', 300));

    expect(result.outcome).toBe('validation_failed');
    expect(result.fieldErrors?.heightCm).toBeTruthy();
  });

  it('rejects any change once active', async () => {
    const { handler, repository } = buildHandler();
    const active = PorteroRegistration.createEmpty('reg-active', 'user-3');
    active.activate();
    repository.seed(active);

    const result = await handler.handle(new SavePhysicalDataSectionCommand('user-3', 180, 75));

    expect(result.outcome).toBe('already_active');
  });
});

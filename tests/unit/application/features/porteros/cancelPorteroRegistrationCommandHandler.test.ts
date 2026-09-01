import { describe, expect, it } from 'vitest';
import { CancelPorteroRegistrationCommand } from '../../../../../src/application/features/porteros/commands/cancelPorteroRegistration/cancelPorteroRegistrationCommand.js';
import { CancelPorteroRegistrationCommandHandler } from '../../../../../src/application/features/porteros/commands/cancelPorteroRegistration/cancelPorteroRegistrationCommandHandler.js';
import { DeleteImageCommand } from '../../../../../src/application/features/images/commands/deleteImage/deleteImageCommand.js';
import { FakePorteroRegistrationRepository } from '../../../../fakes/fakePorteroRegistrationRepository.js';
import { FakeSender } from '../../../../fakes/fakeSender.js';
import { PorteroRegistration } from '../../../../../src/domain/porteros/porteroRegistration.js';

function buildHandler() {
  const repository = new FakePorteroRegistrationRepository();
  const sender = new FakeSender();
  const handler = new CancelPorteroRegistrationCommandHandler(sender, repository);
  return { repository, sender, handler };
}

describe('CancelPorteroRegistrationCommandHandler', () => {
  it('deletes both document photos and the registration itself', async () => {
    const { handler, repository, sender } = buildHandler();
    const registration = PorteroRegistration.createEmpty('reg-1', 'user-1');
    registration.setDocumentPhoto('A', 'img-a');
    registration.setDocumentPhoto('B', 'img-b');
    registration.savePhysicalData({ heightCm: 185, weightKg: 78 });
    repository.seed(registration);
    sender.respondWith(DeleteImageCommand, { outcome: 'success' });

    const result = await handler.handle(new CancelPorteroRegistrationCommand('user-1'));

    expect(result.outcome).toBe('success');
    expect(result.registration?.status).toBe('not_started');
    expect(await repository.getByUserId('user-1')).toBeNull();
    const deletedIds = sender.sent.filter((r) => r instanceof DeleteImageCommand).map((r) => (r as DeleteImageCommand).imageId);
    expect(deletedIds).toEqual(expect.arrayContaining(['img-a', 'img-b']));
  });

  it('is a graceful no-op when nothing was ever saved', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new CancelPorteroRegistrationCommand('user-2'));

    expect(result.outcome).toBe('success');
    expect(result.registration?.status).toBe('not_started');
  });

  it('does not attempt to delete photos that were never uploaded', async () => {
    const { handler, repository, sender } = buildHandler();
    const registration = PorteroRegistration.createEmpty('reg-1', 'user-3');
    registration.savePhysicalData({ heightCm: 185, weightKg: 78 });
    repository.seed(registration);

    await handler.handle(new CancelPorteroRegistrationCommand('user-3'));

    expect(sender.sent.filter((r) => r instanceof DeleteImageCommand)).toHaveLength(0);
  });

  it('refuses to cancel an active profile', async () => {
    const { handler, repository } = buildHandler();
    const active = PorteroRegistration.createEmpty('reg-active', 'user-4');
    active.activate();
    repository.seed(active);

    const result = await handler.handle(new CancelPorteroRegistrationCommand('user-4'));

    expect(result.outcome).toBe('already_active');
    expect(await repository.getByUserId('user-4')).not.toBeNull();
  });
});

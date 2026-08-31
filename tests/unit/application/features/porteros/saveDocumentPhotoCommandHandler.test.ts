import { describe, expect, it } from 'vitest';
import { SaveDocumentPhotoCommand } from '../../../../../src/application/features/porteros/commands/saveDocumentPhoto/saveDocumentPhotoCommand.js';
import { SaveDocumentPhotoCommandHandler } from '../../../../../src/application/features/porteros/commands/saveDocumentPhoto/saveDocumentPhotoCommandHandler.js';
import { StoreImageCommand } from '../../../../../src/application/features/images/commands/storeImage/storeImageCommand.js';
import { DeleteImageCommand } from '../../../../../src/application/features/images/commands/deleteImage/deleteImageCommand.js';
import { FakePorteroRegistrationRepository } from '../../../../fakes/fakePorteroRegistrationRepository.js';
import { FakeSender } from '../../../../fakes/fakeSender.js';
import { PorteroRegistration } from '../../../../../src/domain/porteros/porteroRegistration.js';

function buildHandler() {
  const repository = new FakePorteroRegistrationRepository();
  const sender = new FakeSender();
  let idCounter = 0;
  const idGenerator = { newId: (): string => `reg-${++idCounter}` };
  const handler = new SaveDocumentPhotoCommandHandler(sender, repository, idGenerator);
  return { repository, sender, handler };
}

const storedImage = {
  id: 'image-1',
  url: 'https://res.cloudinary.com/demo/image/upload/v1/abc.jpg',
  format: 'jpg',
  bytes: 1000,
  width: 800,
  height: 600,
  createdAt: '2026-08-30T00:00:00.000Z',
};

describe('SaveDocumentPhotoCommandHandler', () => {
  it('stores the upload and sets it on the given side, creating the registration if needed', async () => {
    const { handler, sender, repository } = buildHandler();
    sender.respondWith(StoreImageCommand, { outcome: 'success', image: storedImage });

    const result = await handler.handle(new SaveDocumentPhotoCommand('user-1', 'A', Buffer.from('x'), 'image/jpeg'));

    expect(result.outcome).toBe('success');
    expect(result.registration?.documentPhotoASubmitted).toBe(true);
    expect(result.registration?.documentPhotoBSubmitted).toBe(false);
    const stored = await repository.getByUserId('user-1');
    expect(stored?.identification.documentPhotoAId).toBe('image-1');
  });

  it('deletes the previous photo for that side only after the new upload succeeds', async () => {
    const { handler, sender, repository } = buildHandler();
    const existing = PorteroRegistration.createEmpty('reg-1', 'user-2');
    existing.setDocumentPhoto('A', 'old-image-id');
    repository.seed(existing);
    sender.respondWith(StoreImageCommand, { outcome: 'success', image: { ...storedImage, id: 'new-image-id' } });
    sender.respondWith(DeleteImageCommand, { outcome: 'success' });

    await handler.handle(new SaveDocumentPhotoCommand('user-2', 'A', Buffer.from('x'), 'image/jpeg'));

    const storeIndex = sender.sent.findIndex((r) => r instanceof StoreImageCommand);
    const deleteIndex = sender.sent.findIndex((r) => r instanceof DeleteImageCommand);
    expect(storeIndex).toBeGreaterThanOrEqual(0);
    expect(deleteIndex).toBeGreaterThan(storeIndex);
    expect((sender.sent[deleteIndex] as DeleteImageCommand).imageId).toBe('old-image-id');
  });

  it('returns storage_unavailable and leaves the existing photo id untouched when the store fails', async () => {
    const { handler, sender, repository } = buildHandler();
    const existing = PorteroRegistration.createEmpty('reg-1', 'user-3');
    existing.setDocumentPhoto('B', 'old-image-id');
    repository.seed(existing);
    sender.respondWith(StoreImageCommand, { outcome: 'storage_unavailable' });

    const result = await handler.handle(new SaveDocumentPhotoCommand('user-3', 'B', Buffer.from('x'), 'image/jpeg'));

    expect(result.outcome).toBe('storage_unavailable');
    const stored = await repository.getByUserId('user-3');
    expect(stored?.identification.documentPhotoBId).toBe('old-image-id');
  });

  it('rejects any change once active', async () => {
    const { handler, repository } = buildHandler();
    const active = PorteroRegistration.createEmpty('reg-active', 'user-4');
    active.activate();
    repository.seed(active);

    const result = await handler.handle(new SaveDocumentPhotoCommand('user-4', 'A', Buffer.from('x'), 'image/jpeg'));

    expect(result.outcome).toBe('already_active');
  });
});

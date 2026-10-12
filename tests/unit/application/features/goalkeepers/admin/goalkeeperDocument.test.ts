import { beforeEach, describe, expect, it } from 'vitest';
import { GetGoalkeeperDocumentQuery } from '../../../../../../src/application/features/goalkeepers/queries/getGoalkeeperDocument/getGoalkeeperDocumentQuery.js';
import { GetGoalkeeperDocumentQueryHandler } from '../../../../../../src/application/features/goalkeepers/queries/getGoalkeeperDocument/getGoalkeeperDocumentQueryHandler.js';
import { CorrectGoalkeeperDocumentCommand } from '../../../../../../src/application/features/goalkeepers/commands/correctGoalkeeperDocument/correctGoalkeeperDocumentCommand.js';
import { CorrectGoalkeeperDocumentCommandHandler } from '../../../../../../src/application/features/goalkeepers/commands/correctGoalkeeperDocument/correctGoalkeeperDocumentCommandHandler.js';
import { documentVersion } from '../../../../../../src/domain/users/contactVersion.js';
import { GoalkeeperProfile } from '../../../../../../src/domain/goalkeepers/goalkeeperProfile.js';
import { GoalkeeperRegistration } from '../../../../../../src/domain/goalkeepers/goalkeeperRegistration.js';
import { DocumentType } from '../../../../../../src/domain/goalkeepers/documentType.js';
import { StoredImage } from '../../../../../../src/domain/images/storedImage.js';
import { FakeGoalkeeperProfileRepository } from '../../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeGoalkeeperRegistrationRepository } from '../../../../../fakes/fakeGoalkeeperRegistrationRepository.js';
import { FakeDocumentTypeRepository } from '../../../../../fakes/fakeDocumentTypeRepository.js';
import { FakeImageRepository } from '../../../../../fakes/fakeImageRepository.js';
import { FakeGoalkeeperDocumentWriter } from '../../../../../fakes/fakeGoalkeeperDocumentWriter.js';

const NOW = new Date('2026-10-12T15:00:00.000Z');

function registration(userId: string, documentNumber: string) {
  const draft = GoalkeeperRegistration.createEmpty(`reg-${userId}`, userId);
  draft.saveIdentification({ documentType: 'CC', documentNumber });
  return draft;
}

describe('the goalkeeper document for the admin (admin spec 005, US5)', () => {
  let profiles: FakeGoalkeeperProfileRepository;
  let registrations: FakeGoalkeeperRegistrationRepository;
  let deps: ConstructorParameters<typeof CorrectGoalkeeperDocumentCommandHandler>[0] & ConstructorParameters<typeof GetGoalkeeperDocumentQueryHandler>[0];

  beforeEach(() => {
    profiles = new FakeGoalkeeperProfileRepository();
    profiles.seed(new GoalkeeperProfile({
      id: 'gp-1', userId: 'u1', documentType: 'CC', documentNumber: '1020304050', issueDate: NOW, birthDate: new Date('1998-01-01'),
      documentPhotoAId: 'img-a', documentPhotoBId: 'img-gone', heightCm: 180, weightKg: 80, cityId: 'med', zoneIds: [], activatedAt: NOW,
    }));
    registrations = new FakeGoalkeeperRegistrationRepository();
    registrations.seed(registration('u1', '1020304050'));
    registrations.seed(registration('u2', '999'));
    const documentTypes = new FakeDocumentTypeRepository();
    documentTypes.seed(new DocumentType({ id: 'd1', code: 'CC', name: 'Cédula de ciudadanía' }));
    documentTypes.seed(new DocumentType({ id: 'd2', code: 'CE', name: 'Cédula de extranjería' }));
    const images = new FakeImageRepository();
    images.seed(new StoredImage({ id: 'img-a', externalId: 'x', url: 'https://img.test/a.jpg', format: 'jpg', bytes: 1, width: 1, height: 1, uploadedBy: 'u1', createdAt: NOW }));
    deps = { profiles, registrations, documentTypes, images, writer: new FakeGoalkeeperDocumentWriter(profiles, registrations) };
  });

  const correct = (version: string, documentType: string, documentNumber: string) =>
    new CorrectGoalkeeperDocumentCommandHandler(deps).handle(new CorrectGoalkeeperDocumentCommand('u1', version, documentType, documentNumber));
  const VERSION = documentVersion({ documentType: 'CC', documentNumber: '1020304050' });

  it('reads the number and the photos, null when an image is gone', async () => {
    expect(await new GetGoalkeeperDocumentQueryHandler(deps).handle(new GetGoalkeeperDocumentQuery('u1'))).toEqual({
      outcome: 'ok',
      document: { documentType: { code: 'CC', name: 'Cédula de ciudadanía' }, documentNumber: '1020304050', photos: { front: 'https://img.test/a.jpg', back: null } },
    });
    expect(await new GetGoalkeeperDocumentQueryHandler(deps).handle(new GetGoalkeeperDocumentQuery('u9'))).toEqual({ outcome: 'not_a_goalkeeper' });
  });

  it('corrects the number in the profile and the registration, and the audit view never has it', async () => {
    const result = await correct(VERSION, 'CC', ' 1020304051 ');

    expect(result).toEqual({
      outcome: 'corrected',
      audit: { userId: 'u1', documentType: { code: 'CC', name: 'Cédula de ciudadanía' }, idNumberChanged: true, changedFields: ['documentNumber'], version: documentVersion({ documentType: 'CC', documentNumber: '1020304051' }) },
    });
    expect((await profiles.getByUserId('u1'))!.documentNumber).toBe('1020304051');
    expect((await registrations.getByUserId('u1'))!.identification.documentNumber).toBe('1020304051');
    expect(JSON.stringify(result)).not.toContain('102030405');
  });

  it('refuses an unknown type, an empty number, a stale version and a document of another goalkeeper', async () => {
    expect(await correct(VERSION, 'XX', '1')).toEqual({ outcome: 'invalid_document_type' });
    expect(await correct(VERSION, 'CC', '   ')).toEqual({ outcome: 'validation_failed', fieldErrors: { documentNumber: expect.any(String) } });
    expect(await correct(VERSION, 'CC', 'x'.repeat(31))).toEqual({ outcome: 'validation_failed', fieldErrors: { documentNumber: expect.any(String) } });
    expect(await correct('old', 'CE', '1')).toEqual({ outcome: 'stale' });
    expect(await correct(VERSION, 'CC', '999')).toEqual({ outcome: 'document_already_registered' });
    expect((await profiles.getByUserId('u1'))!.documentNumber).toBe('1020304050');
  });

  it('answers not_a_goalkeeper, and changes nothing when the values are the same', async () => {
    expect(await new CorrectGoalkeeperDocumentCommandHandler(deps).handle(new CorrectGoalkeeperDocumentCommand('u9', VERSION, 'CC', '1'))).toEqual({ outcome: 'not_a_goalkeeper' });
    expect(await correct(VERSION, 'CC', '1020304050')).toMatchObject({ outcome: 'corrected', audit: { idNumberChanged: false, changedFields: [] } });
  });
});

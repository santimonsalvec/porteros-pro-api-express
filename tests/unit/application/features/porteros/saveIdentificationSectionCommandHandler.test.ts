import { describe, expect, it } from 'vitest';
import { SaveIdentificationSectionCommand } from '../../../../../src/application/features/porteros/commands/saveIdentificationSection/saveIdentificationSectionCommand.js';
import { SaveIdentificationSectionCommandHandler } from '../../../../../src/application/features/porteros/commands/saveIdentificationSection/saveIdentificationSectionCommandHandler.js';
import { FakePorteroRegistrationRepository } from '../../../../fakes/fakePorteroRegistrationRepository.js';
import { FakeDocumentTypeRepository } from '../../../../fakes/fakeDocumentTypeRepository.js';
import { DocumentType } from '../../../../../src/domain/porteros/documentType.js';
import { PorteroRegistration } from '../../../../../src/domain/porteros/porteroRegistration.js';

function buildHandler() {
  const registrationRepository = new FakePorteroRegistrationRepository();
  const documentTypeRepository = new FakeDocumentTypeRepository();
  documentTypeRepository.seed(new DocumentType({ id: 'dt1', code: 'cedula_ciudadania', name: 'Cédula de ciudadanía' }));
  let idCounter = 0;
  const idGenerator = { newId: (): string => `reg-${++idCounter}` };
  const handler = new SaveIdentificationSectionCommandHandler(registrationRepository, documentTypeRepository, idGenerator);
  return { registrationRepository, documentTypeRepository, handler };
}

describe('SaveIdentificationSectionCommandHandler', () => {
  it('creates a new registration and merges only the provided fields', async () => {
    const { handler, registrationRepository } = buildHandler();

    const result = await handler.handle(
      new SaveIdentificationSectionCommand('user-1', 'cedula_ciudadania', '123456', undefined, undefined),
    );

    expect(result.outcome).toBe('success');
    expect(result.registration?.documentType).toBe('cedula_ciudadania');
    expect(result.registration?.documentNumber).toBe('123456');
    expect(result.registration?.issueDate).toBeNull();
    const stored = await registrationRepository.getByUserId('user-1');
    expect(stored?.identification.documentNumber).toBe('123456');
  });

  it('rejects an unrecognized document type', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new SaveIdentificationSectionCommand('user-1', 'not_a_real_type'));

    expect(result.outcome).toBe('invalid_document_type');
  });

  it('rejects a birth date indicating an age under 18', async () => {
    const { handler } = buildHandler();
    const under18 = new Date();
    under18.setUTCFullYear(under18.getUTCFullYear() - 17);

    const result = await handler.handle(
      new SaveIdentificationSectionCommand('user-1', undefined, undefined, undefined, under18.toISOString().slice(0, 10)),
    );

    expect(result.outcome).toBe('validation_failed');
    expect(result.fieldErrors?.birthDate).toBeTruthy();
  });

  it('rejects an issue date before an already-stored birth date', async () => {
    const { handler, registrationRepository } = buildHandler();
    const existing = PorteroRegistration.createEmpty('reg-existing', 'user-2');
    existing.saveIdentification({ birthDate: new Date('2000-01-01') });
    registrationRepository.seed(existing);

    const result = await handler.handle(new SaveIdentificationSectionCommand('user-2', undefined, undefined, '1999-01-01'));

    expect(result.outcome).toBe('validation_failed');
    expect(result.fieldErrors?.issueDate).toBeTruthy();
  });

  it('rejects a duplicate document type + number pair from a different client', async () => {
    const { handler, registrationRepository } = buildHandler();
    const other = PorteroRegistration.createEmpty('reg-other', 'user-other');
    other.saveIdentification({ documentType: 'cedula_ciudadania', documentNumber: '999' });
    registrationRepository.seed(other);

    const result = await handler.handle(new SaveIdentificationSectionCommand('user-3', 'cedula_ciudadania', '999'));

    expect(result.outcome).toBe('duplicate_document');
  });

  it('allows a client to resubmit their own already-stored document without conflict', async () => {
    const { handler, registrationRepository } = buildHandler();
    const mine = PorteroRegistration.createEmpty('reg-mine', 'user-4');
    mine.saveIdentification({ documentType: 'cedula_ciudadania', documentNumber: '555' });
    registrationRepository.seed(mine);

    const result = await handler.handle(new SaveIdentificationSectionCommand('user-4', 'cedula_ciudadania', '555'));

    expect(result.outcome).toBe('success');
  });

  it('rejects any change once the registration is active', async () => {
    const { handler, registrationRepository } = buildHandler();
    const active = PorteroRegistration.createEmpty('reg-active', 'user-5');
    active.activate();
    registrationRepository.seed(active);

    const result = await handler.handle(new SaveIdentificationSectionCommand('user-5', 'cedula_ciudadania', '111'));

    expect(result.outcome).toBe('already_active');
  });
});

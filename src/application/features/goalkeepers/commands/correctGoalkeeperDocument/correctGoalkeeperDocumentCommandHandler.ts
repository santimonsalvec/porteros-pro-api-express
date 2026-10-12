import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { documentVersion } from '../../../../../domain/users/contactVersion.js';
import type { IDocumentTypeRepository, IGoalkeeperProfileRepository, IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import type { IGoalkeeperDocumentWriter } from '../../common/adminPorts.js';
import { validateIdentificationFields } from '../../common/validation.js';
import { CorrectGoalkeeperDocumentCommand, type CorrectGoalkeeperDocumentResult } from './correctGoalkeeperDocumentCommand.js';

/** Longer than any identity number the catalog's types use. */
const MAX_DOCUMENT_NUMBER = 30;

/**
 * Corrects the document with the registration's own rules (catalog type, a number, unique among
 * goalkeepers). Invoices issued before keep the old data; the next commission and any retried
 * invoice read the corrected profile (research §11). The result never carries the number.
 */
export class CorrectGoalkeeperDocumentCommandHandler implements ICommandHandler<CorrectGoalkeeperDocumentCommand, CorrectGoalkeeperDocumentResult> {
  constructor(
    private readonly deps: {
      profiles: Pick<IGoalkeeperProfileRepository, 'getByUserId'>;
      registrations: Pick<IGoalkeeperRegistrationRepository, 'existsByDocument'>;
      documentTypes: Pick<IDocumentTypeRepository, 'findByCode'>;
      writer: IGoalkeeperDocumentWriter;
    },
  ) {}

  async handle(command: CorrectGoalkeeperDocumentCommand): Promise<CorrectGoalkeeperDocumentResult> {
    const profile = await this.deps.profiles.getByUserId(command.userId);
    if (!profile) return { outcome: 'not_a_goalkeeper' };
    const documentType = await this.deps.documentTypes.findByCode(command.documentType);
    if (!documentType) return { outcome: 'invalid_document_type' };
    const documentNumber = command.documentNumber.trim();
    const { fieldErrors } = validateIdentificationFields({ documentNumber });
    if (documentNumber.length > MAX_DOCUMENT_NUMBER) fieldErrors.documentNumber = `At most ${MAX_DOCUMENT_NUMBER} characters.`;
    if (Object.keys(fieldErrors).length > 0) return { outcome: 'validation_failed', fieldErrors };

    const expected = { documentType: profile.documentType, documentNumber: profile.documentNumber };
    if (command.version !== documentVersion(expected)) return { outcome: 'stale' };
    const next = { documentType: documentType.code, documentNumber };
    const changedFields = (['documentType', 'documentNumber'] as const).filter((field) => expected[field] !== next[field]);

    if (changedFields.length > 0) {
      if (await this.deps.registrations.existsByDocument(next.documentType, next.documentNumber, command.userId)) {
        return { outcome: 'document_already_registered' };
      }
      const written = await this.deps.writer.correct(command.userId, expected, next);
      if (written === 'stale') return { outcome: 'stale' };
      if (written === 'duplicate') return { outcome: 'document_already_registered' };
    }
    return {
      outcome: 'corrected',
      audit: {
        userId: command.userId,
        documentType: { code: documentType.code, name: documentType.name },
        idNumberChanged: changedFields.includes('documentNumber'),
        changedFields: [...changedFields],
        version: documentVersion(next),
      },
    };
  }
}

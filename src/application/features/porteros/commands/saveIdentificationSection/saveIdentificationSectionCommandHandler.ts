import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IDocumentTypeRepository, IPorteroRegistrationRepository } from '../../common/ports.js';
import { validateIdentificationFields } from '../../common/validation.js';
import { toPorteroRegistrationResponse } from '../../common/porteroRegistrationResponse.js';
import { PorteroRegistration } from '../../../../../domain/porteros/porteroRegistration.js';
import { SaveIdentificationSectionCommand, type SaveIdentificationSectionResult } from './saveIdentificationSectionCommand.js';

export class SaveIdentificationSectionCommandHandler
  implements ICommandHandler<SaveIdentificationSectionCommand, SaveIdentificationSectionResult>
{
  constructor(
    private readonly porteroRegistrationRepository: IPorteroRegistrationRepository,
    private readonly documentTypeRepository: IDocumentTypeRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async handle(command: SaveIdentificationSectionCommand): Promise<SaveIdentificationSectionResult> {
    let registration = await this.porteroRegistrationRepository.getByUserId(command.userId);
    if (registration?.status === 'active') {
      return { outcome: 'already_active' };
    }

    const { fieldErrors, parsedIssueDate, parsedBirthDate } = validateIdentificationFields({
      documentNumber: command.documentNumber,
      issueDate: command.issueDate,
      birthDate: command.birthDate,
    });

    const effectiveBirthDate = parsedBirthDate ?? registration?.identification.birthDate ?? undefined;
    if (parsedIssueDate && effectiveBirthDate && parsedIssueDate.getTime() < effectiveBirthDate.getTime()) {
      fieldErrors.issueDate = 'Issue date cannot be before your birth date.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      return { outcome: 'validation_failed', fieldErrors };
    }

    let documentTypeCode: string | undefined;
    if (command.documentType !== undefined) {
      const documentType = await this.documentTypeRepository.findByCode(command.documentType);
      if (!documentType) {
        return { outcome: 'invalid_document_type' };
      }
      documentTypeCode = documentType.code;
    }

    const documentNumber = command.documentNumber !== undefined ? command.documentNumber.trim() : undefined;
    const effectiveDocumentType = documentTypeCode ?? registration?.identification.documentType ?? undefined;
    const effectiveDocumentNumber = documentNumber ?? registration?.identification.documentNumber ?? undefined;
    if (effectiveDocumentType && effectiveDocumentNumber) {
      const duplicate = await this.porteroRegistrationRepository.existsByDocument(
        effectiveDocumentType,
        effectiveDocumentNumber,
        command.userId,
      );
      if (duplicate) {
        return { outcome: 'duplicate_document' };
      }
    }

    const isNew = registration === null;
    if (!registration) {
      registration = PorteroRegistration.createEmpty(this.idGenerator.newId(), command.userId);
    }

    registration.saveIdentification({
      ...(documentTypeCode !== undefined ? { documentType: documentTypeCode } : {}),
      ...(documentNumber !== undefined ? { documentNumber } : {}),
      ...(parsedIssueDate !== undefined ? { issueDate: parsedIssueDate } : {}),
      ...(parsedBirthDate !== undefined ? { birthDate: parsedBirthDate } : {}),
    });

    if (isNew) {
      await this.porteroRegistrationRepository.add(registration);
    } else {
      await this.porteroRegistrationRepository.update(registration);
    }

    return { outcome: 'success', registration: toPorteroRegistrationResponse(registration) };
  }
}

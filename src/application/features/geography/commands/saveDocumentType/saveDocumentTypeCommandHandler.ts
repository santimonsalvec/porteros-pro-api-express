import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import { DocumentType, isInvoiceableDocumentType } from '../../../../../domain/goalkeepers/documentType.js';
import type { IAdminDocumentTypeRepository, IReferenceUsage } from '../../common/ports.js';
import { needsAcknowledgement, warning } from '../../common/warnings.js';
import { SaveDocumentTypeCommand, type DocumentTypeFields, type SaveDocumentTypeResult } from './saveDocumentTypeCommand.js';

export class SaveDocumentTypeCommandHandler implements ICommandHandler<SaveDocumentTypeCommand, SaveDocumentTypeResult> {
  constructor(private readonly deps: { documentTypes: IAdminDocumentTypeRepository; usage: IReferenceUsage; ids: IIdGenerator }) {}

  async handle(command: SaveDocumentTypeCommand): Promise<SaveDocumentTypeResult> {
    const stored = command.documentTypeId === null ? null : await this.deps.documentTypes.getById(command.documentTypeId);
    if (command.documentTypeId !== null && !stored) return { outcome: 'not_found' };

    const id = stored?.id ?? this.deps.ids.newId();
    const fields = { ...(stored ? { code: stored.code, name: stored.name } : {}), ...command.fields } as DocumentTypeFields;
    const codeChanged = !stored || fields.code !== stored.code;

    const sameCode = codeChanged ? await this.deps.documentTypes.findByCode(fields.code) : null;
    if (sameCode && sameCode.id !== id) return { outcome: 'document_type_code_taken' };
    // Goalkeepers store the code itself: renaming it would orphan them.
    if (stored && codeChanged && (await this.deps.usage.documentTypeUsage(stored.code))) return { outcome: 'document_type_code_in_use' };

    const warnings = codeChanged && !isInvoiceableDocumentType(fields.code) ? [warning('document_type_not_invoiceable', { code: fields.code })] : [];
    if (needsAcknowledgement(warnings, command.acknowledgeWarnings)) return { outcome: 'warnings', warnings };

    const documentType = new DocumentType({ id, ...fields, revision: stored ? command.revision : 0 });
    if (!stored) {
      await this.deps.documentTypes.create(documentType);
      return { outcome: 'saved', documentTypeId: id, created: true };
    }
    const result = await this.deps.documentTypes.update(documentType);
    return result === 'saved' ? { outcome: 'saved', documentTypeId: id, created: false } : { outcome: 'stale' };
  }
}

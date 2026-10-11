import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { deleteUnused, type DeleteResult } from '../../common/deletion.js';
import type { IAdminDocumentTypeRepository, IReferenceUsage } from '../../common/ports.js';
import { DeleteDocumentTypeCommand } from './deleteDocumentTypeCommand.js';

export class DeleteDocumentTypeCommandHandler implements ICommandHandler<DeleteDocumentTypeCommand, DeleteResult> {
  constructor(private readonly deps: { documentTypes: IAdminDocumentTypeRepository; usage: IReferenceUsage }) {}

  async handle({ documentTypeId }: DeleteDocumentTypeCommand): Promise<DeleteResult> {
    const stored = await this.deps.documentTypes.getById(documentTypeId);
    return deleteUnused(
      async () => stored !== null,
      // Goalkeepers point at the code, not the id.
      () => this.deps.usage.documentTypeUsage(stored!.code),
      () => this.deps.documentTypes.delete(documentTypeId),
    );
  }
}

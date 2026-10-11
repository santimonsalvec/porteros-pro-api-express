import { ICommand } from '../../../../common/mediator/types.js';
import type { DeleteResult } from '../../common/deletion.js';

/** Deletes a document type no goalkeeper uses; the reason goes to the audit log only. */
export class DeleteDocumentTypeCommand extends ICommand<DeleteResult> {
  constructor(readonly documentTypeId: string) {
    super();
  }
}

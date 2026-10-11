import { ICommand } from '../../../../common/mediator/types.js';
import type { Warning } from '../../common/warnings.js';

export interface DocumentTypeFields {
  code: string;
  name: string;
}

export type SaveDocumentTypeResult =
  | { outcome: 'saved'; documentTypeId: string; created: boolean }
  | { outcome: 'not_found' }
  | { outcome: 'stale' }
  | { outcome: 'document_type_code_taken' }
  | { outcome: 'document_type_code_in_use' }
  | { outcome: 'warnings'; warnings: Warning[] };

/** Creates a document type, or edits one (admin spec 003, US5). */
export class SaveDocumentTypeCommand extends ICommand<SaveDocumentTypeResult> {
  /** Use `create` or `edit`. */
  constructor(
    readonly documentTypeId: string | null,
    readonly revision: number,
    readonly fields: Partial<DocumentTypeFields>,
    readonly acknowledgeWarnings: boolean,
  ) {
    super();
  }

  static create(fields: DocumentTypeFields, acknowledgeWarnings = false): SaveDocumentTypeCommand {
    return new SaveDocumentTypeCommand(null, 0, fields, acknowledgeWarnings);
  }

  static edit(documentTypeId: string, revision: number, changes: Partial<DocumentTypeFields>, acknowledgeWarnings = false): SaveDocumentTypeCommand {
    return new SaveDocumentTypeCommand(documentTypeId, revision, changes, acknowledgeWarnings);
  }
}

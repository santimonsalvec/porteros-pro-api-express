import { ICommand } from '../../../../common/mediator/types.js';
import type { DocumentCorrectionAudit } from '../../common/adminViews.js';

export type CorrectGoalkeeperDocumentResult =
  | { outcome: 'corrected'; audit: DocumentCorrectionAudit }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'invalid_document_type' }
  | { outcome: 'validation_failed'; fieldErrors: Record<string, string> }
  | { outcome: 'stale' }
  | { outcome: 'document_already_registered' };

/** An administrator corrects a goalkeeper's document type and number (FR-009). */
export class CorrectGoalkeeperDocumentCommand extends ICommand<CorrectGoalkeeperDocumentResult> {
  constructor(
    readonly userId: string,
    readonly version: string,
    readonly documentType: string,
    readonly documentNumber: string,
  ) {
    super();
  }
}

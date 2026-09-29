import { ICommand } from '../../../../common/mediator/types.js';
import type { AdminDocumentItemResponse } from '../../common/documentResponses.js';

export type RetryDocumentResult =
  | { outcome: 'retried'; document: AdminDocumentItemResponse }
  | { outcome: 'not_found' }
  | { outcome: 'not_retryable'; status: string };

/** An administrator retries a rejected document after fixing its data (US4). */
export class RetryDocumentCommand extends ICommand<RetryDocumentResult> {
  constructor(
    public readonly adminUserId: string,
    public readonly documentId: string,
  ) {
    super();
  }
}

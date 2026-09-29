import type { INotificationHandler } from '../../../common/mediator/types.js';
import { isBillingEvent } from '../../../../domain/events/billingEvents.js';
import type { DomainEvent } from '../../../../domain/events/domainEvent.js';
import { documentForMovement, type DocumentForMovementDependencies } from '../common/documentForMovement.js';
import { issueDocument, type IssueDocumentDependencies } from '../common/issueDocument.js';

export type CreateInvoicingDocumentDependencies = DocumentForMovementDependencies & IssueDocumentDependencies;

/**
 * The consumer of billing events (clarification 1): a separate process from the charge. It creates
 * the pending document (once per movement) and tries to issue it once. A provider failure is
 * recorded on the document and left to the sweep, so the event is acknowledged and never reaches
 * the dead-letter for an outage; only a database failure throws, so the event is delivered again.
 */
export class CreateInvoicingDocumentHandler implements INotificationHandler<DomainEvent> {
  readonly name = 'invoicing';

  constructor(private readonly deps: CreateInvoicingDocumentDependencies) {}

  async handle(event: DomainEvent): Promise<void> {
    if (!isBillingEvent(event)) return;
    const found = await documentForMovement(this.deps, event.payload.movementId, event.id);
    if (!found) return;
    this.deps.logger.info(
      { outcome: found.created ? 'invoicing_document_created' : 'invoicing_document_known', documentId: found.document.id, eventId: event.id, type: event.type },
      'Invoicing document for a billing event',
    );
    // Issued right away when possible; otherwise the sweep retries it.
    await issueDocument(this.deps, found.document, this.deps.clock.now());
  }
}

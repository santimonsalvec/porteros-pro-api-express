import type { IScheduledJob } from '../../events/common/ports.js';
import { documentForMovement } from '../common/documentForMovement.js';
import { issueDocument, refreshAwaitingDocument, type IssueOutcome } from '../common/issueDocument.js';
import type { IBillableMovementScanner } from '../common/ports.js';
import type { CreateInvoicingDocumentDependencies } from '../handlers/createInvoicingDocument.js';

export interface InvoicingIssuerDependencies extends CreateInvoicingDocumentDependencies {
  scanner: IBillableMovementScanner;
  /** Documents handled per step and run. */
  cap: number;
}

/** Movements younger than this are left to their event (research.md §2.4). */
const SAFETY_NET_DELAY_MS = 10 * 60_000;
const STALE_MS = 24 * 60 * 60_000;

/**
 * Every sweep (research.md §2): issues the pending documents that are due, re-reads the ones
 * awaiting the tax authority, creates any document whose event was lost, and warns about
 * documents still pending after 24 hours. One document failing never stops the others.
 */
export class InvoicingIssuerJob implements IScheduledJob {
  readonly name = 'invoicing-issuer';
  readonly leaseSeconds = 55;

  constructor(private readonly deps: InvoicingIssuerDependencies) {}

  async run(now: Date): Promise<string> {
    const counts = { issued: 0, awaiting: 0, rejected: 0, retried: 0, recovered: 0 };
    const count = (outcome: IssueOutcome) => {
      if (outcome === 'issued') counts.issued += 1;
      if (outcome === 'awaiting') counts.awaiting += 1;
      if (outcome === 'rejected') counts.rejected += 1;
      if (outcome === 'retry') counts.retried += 1;
    };

    for (const document of await this.deps.documents.findDue(now, this.deps.cap)) {
      await this.guard(document.id, async () => count((await issueDocument(this.deps, document, now)).outcome));
    }
    for (const document of await this.deps.documents.findAwaiting(now, this.deps.cap)) {
      await this.guard(document.id, async () => count((await refreshAwaitingDocument(this.deps, document, now)).outcome));
    }
    for (const lost of await this.deps.scanner.findWithoutDocument(new Date(now.getTime() - SAFETY_NET_DELAY_MS), this.deps.cap)) {
      await this.guard(lost.movementId, async () => {
        const found = await documentForMovement(this.deps, lost.movementId, null);
        if (!found?.created) return;
        counts.recovered += 1;
        this.deps.logger.warn({ outcome: 'invoicing_document_recovered', movementId: lost.movementId, documentId: found.document.id }, 'Invoicing document created without its event');
        count((await issueDocument(this.deps, found.document, now)).outcome);
      });
    }

    const stale = await this.deps.documents.countStale(new Date(now.getTime() - STALE_MS));
    if (stale > 0) this.deps.logger.warn({ outcome: 'invoicing_pending_too_long', count: stale }, 'Invoicing documents pending for more than 24 hours');
    const changed = counts.issued + counts.awaiting + counts.rejected + counts.retried + counts.recovered;
    if (changed > 0) this.deps.logger.info({ outcome: 'invoicing_issuer', ...counts }, 'Invoicing documents processed');
    return `${counts.issued} issued, ${counts.awaiting} awaiting, ${counts.rejected} rejected, ${counts.retried} retried, ${counts.recovered} recovered`;
  }

  private async guard(ref: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.deps.logger.warn(
        { outcome: 'invoicing_item_failed', ref, error: error instanceof Error ? error.message : String(error) },
        'Invoicing item failed; retried next sweep',
      );
    }
  }
}

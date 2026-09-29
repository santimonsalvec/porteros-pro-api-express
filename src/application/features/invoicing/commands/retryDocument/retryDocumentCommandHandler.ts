import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import { toAdminDocumentItem } from '../../common/documentResponses.js';
import { issueDocument, type IssueDocumentDependencies } from '../../common/issueDocument.js';
import { RetryDocumentCommand, type RetryDocumentResult } from './retryDocumentCommand.js';

export interface RetryDocumentDependencies extends IssueDocumentDependencies {
  users: IUserRepository;
  profiles: IGoalkeeperProfileRepository;
  clock: { now(): Date };
}

/**
 * Puts a rejected document back to pending with the buyer's current name, email, city and
 * document (US4 scenario 2), then tries it at once. Only a rejected document can be retried.
 */
export class RetryDocumentCommandHandler implements ICommandHandler<RetryDocumentCommand, RetryDocumentResult> {
  constructor(private readonly deps: RetryDocumentDependencies) {}

  async handle(command: RetryDocumentCommand): Promise<RetryDocumentResult> {
    const document = await this.deps.documents.getById(command.documentId);
    if (!document) return { outcome: 'not_found' };
    if (document.status !== 'rejected') return { outcome: 'not_retryable', status: document.status };

    const [user, profile] = await Promise.all([this.deps.users.getById(document.goalkeeperId), this.deps.profiles.getByUserId(document.goalkeeperId)]);
    const now = this.deps.clock.now();
    const reset = document.resetForRetry(
      {
        documentType: profile?.documentType ?? document.buyer.documentType,
        documentNumber: profile?.documentNumber ?? document.buyer.documentNumber,
        firstName: user?.firstName ?? document.buyer.firstName,
        lastName: user?.lastName ?? document.buyer.lastName,
        email: user?.email ?? document.buyer.email,
        cityId: profile?.cityId ?? document.buyer.cityId,
      },
      now,
    );
    if (!(await this.deps.documents.update(reset, 'rejected'))) return { outcome: 'not_retryable', status: 'changed' };
    this.deps.logger.info({ outcome: 'invoicing_document_retry_requested', documentId: document.id, adminUserId: command.adminUserId }, 'Invoicing document retried by an administrator');
    const { document: attempted } = await issueDocument(this.deps, reset, now);
    return { outcome: 'retried', document: toAdminDocumentItem(attempted, now) };
  }
}

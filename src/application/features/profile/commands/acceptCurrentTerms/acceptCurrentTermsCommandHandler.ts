import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { TermsAcceptance } from '../../../../../domain/users/termsAcceptance.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { LegalDocumentVersions } from '../completeProfile/completeProfileCommandHandler.js';
import type { ITermsAcceptanceRepository } from '../../common/ports.js';
import { AcceptCurrentTermsCommand, type AcceptCurrentTermsResult } from './acceptCurrentTermsCommand.js';

/** Appends an acceptance of the current versions, with the same evidence as the profile completion. */
export class AcceptCurrentTermsCommandHandler implements ICommandHandler<AcceptCurrentTermsCommand, AcceptCurrentTermsResult> {
  constructor(
    private readonly termsRepository: ITermsAcceptanceRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly clock: IClock,
    private readonly legalVersions: LegalDocumentVersions,
  ) {}

  async handle(command: AcceptCurrentTermsCommand): Promise<AcceptCurrentTermsResult> {
    const acceptance = new TermsAcceptance({
      id: this.idGenerator.newId(),
      userId: command.userId,
      termsVersion: this.legalVersions.termsVersion,
      privacyPolicyVersion: this.legalVersions.privacyPolicyVersion,
      acceptedAt: this.clock.now(),
      ipAddress: command.ipAddress,
      userAgent: command.userAgent,
    });
    await this.termsRepository.add(acceptance);
    return {
      termsVersion: acceptance.termsVersion,
      privacyPolicyVersion: acceptance.privacyPolicyVersion,
      acceptedAt: acceptance.acceptedAt.toISOString(),
    };
  }
}

import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { normalizeCaseNote } from '../../../../../domain/cases/case.js';
import type { IBookingAuditLogger } from '../../../goalkeeperRequests/common/ports.js';
import type { IRatingRepository } from '../../../ratings/common/ports.js';
import { toCaseDetail } from '../../common/caseResponses.js';
import type { ICaseRepository } from '../../common/ports.js';
import { ResolveCaseCommand, type ResolveCaseResult } from './resolveCaseCommand.js';

/**
 * Closes a case once (feature 021). Resolving doesn't undo anything by itself: to lift a no-show's
 * penalty the administrator uses the withdrawal reversal (018) on its incident.
 */
export class ResolveCaseCommandHandler implements ICommandHandler<ResolveCaseCommand, ResolveCaseResult> {
  constructor(
    private readonly cases: ICaseRepository,
    private readonly ratings: IRatingRepository,
    private readonly clock: IClock,
    private readonly audit: IBookingAuditLogger,
  ) {}

  async handle(command: ResolveCaseCommand): Promise<ResolveCaseResult> {
    const result = await this.resolve(command);
    this.audit.logCaseResolution({ outcome: result.outcome, adminId: command.adminId, caseId: command.caseId });
    return result;
  }

  private async resolve(command: ResolveCaseCommand): Promise<ResolveCaseResult> {
    let note: string;
    try {
      note = normalizeCaseNote(command.note);
    } catch (error) {
      return { outcome: 'invalid_note', message: (error as Error).message };
    }
    const outcome = await this.cases.resolve(command.caseId, { by: command.adminId, at: this.clock.now(), note });
    if (outcome === 'not_found') return { outcome: 'case_not_found' };
    if (outcome === 'already_resolved') return { outcome: 'case_already_resolved' };
    const item = (await this.cases.getById(command.caseId))!;
    return { outcome: 'resolved', case: toCaseDetail(item, await this.ratings.getById(item.ratingId)) };
  }
}

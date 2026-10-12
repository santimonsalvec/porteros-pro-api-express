import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { amountLimitIssues } from '../../../../../domain/pricing/adminLimits.js';
import { fieldErrorsOf } from '../../common/fieldErrors.js';
import type { ICommissionAdmin } from '../../common/ports.js';
import { UpdateCommissionCommand, type UpdateCommissionResult } from './updateCommissionCommand.js';

export class UpdateCommissionCommandHandler implements ICommandHandler<UpdateCommissionCommand, UpdateCommissionResult> {
  constructor(private readonly deps: { commissions: ICommissionAdmin }) {}

  async handle({ commissionId, revision, amount }: UpdateCommissionCommand): Promise<UpdateCommissionResult> {
    const issues = amountLimitIssues('amount', amount);
    if (issues.length > 0) return { outcome: 'invalid', fieldErrors: fieldErrorsOf(issues) };
    if (!(await this.deps.commissions.getById(commissionId))) return { outcome: 'not_found' };
    const result = await this.deps.commissions.updateAmount(commissionId, revision, amount);
    return result === 'saved' ? { outcome: 'saved', commissionId } : { outcome: 'stale' };
  }
}

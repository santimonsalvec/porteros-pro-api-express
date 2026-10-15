import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { depositNames, toDepositDetail, type DepositAdminDependencies } from '../../common/depositAdminViews.js';
import { GetDepositAdminQuery, type GetDepositAdminResult } from './getDepositAdminQuery.js';

export class GetDepositAdminQueryHandler implements IQueryHandler<GetDepositAdminQuery, GetDepositAdminResult> {
  constructor(private readonly deps: DepositAdminDependencies) {}

  async handle({ depositId }: GetDepositAdminQuery): Promise<GetDepositAdminResult> {
    const record = await this.deps.reader.get(depositId);
    if (!record) return { outcome: 'not_found' };
    const staffIds = record.checkLog.flatMap((check) => (check.staffUserId ? [check.staffUserId] : []));
    const names = await depositNames(this.deps, [record.deposit], staffIds);
    return { outcome: 'ok', deposit: toDepositDetail(record.deposit, record.checkLog, names) };
  }
}

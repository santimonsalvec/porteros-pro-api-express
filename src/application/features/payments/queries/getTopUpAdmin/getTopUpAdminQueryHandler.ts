import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { topUpNames, toTopUpDetail, type TopUpAdminDependencies } from '../../common/topUpAdminViews.js';
import { GetTopUpAdminQuery, type GetTopUpAdminResult } from './getTopUpAdminQuery.js';

export class GetTopUpAdminQueryHandler implements IQueryHandler<GetTopUpAdminQuery, GetTopUpAdminResult> {
  constructor(private readonly deps: TopUpAdminDependencies) {}

  async handle({ topUpId }: GetTopUpAdminQuery): Promise<GetTopUpAdminResult> {
    const record = await this.deps.reader.get(topUpId);
    if (!record) return { outcome: 'not_found' };
    const staffIds = record.checkLog.flatMap((check) => (check.staffUserId ? [check.staffUserId] : []));
    const names = await topUpNames(this.deps, [record.topUp], staffIds);
    return { outcome: 'ok', topUp: toTopUpDetail(record.topUp, record.checkLog, names) };
  }
}

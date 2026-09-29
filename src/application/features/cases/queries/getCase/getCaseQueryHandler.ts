import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IRatingRepository } from '../../../ratings/common/ports.js';
import { toCaseDetail } from '../../common/caseResponses.js';
import type { ICaseRepository } from '../../common/ports.js';
import { GetCaseQuery, type GetCaseResult } from './getCaseQuery.js';

export class GetCaseQueryHandler implements IQueryHandler<GetCaseQuery, GetCaseResult> {
  constructor(
    private readonly cases: ICaseRepository,
    private readonly ratings: IRatingRepository,
  ) {}

  async handle(query: GetCaseQuery): Promise<GetCaseResult> {
    const item = await this.cases.getById(query.caseId);
    if (!item) return { outcome: 'case_not_found' };
    return { outcome: 'ok', case: toCaseDetail(item, await this.ratings.getById(item.ratingId)) };
  }
}

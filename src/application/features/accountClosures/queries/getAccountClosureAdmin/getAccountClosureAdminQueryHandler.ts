import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { AccountClosureDependencies } from '../../common/accountClosureDependencies.js';
import { buildDetail } from '../../common/closureAdminResults.js';
import { GetAccountClosureAdminQuery, type GetAccountClosureAdminResult } from './getAccountClosureAdminQuery.js';

export class GetAccountClosureAdminQueryHandler implements IQueryHandler<GetAccountClosureAdminQuery, GetAccountClosureAdminResult> {
  constructor(private readonly deps: AccountClosureDependencies) {}

  async handle({ closureId }: GetAccountClosureAdminQuery): Promise<GetAccountClosureAdminResult> {
    const closure = await this.deps.closures.findById(closureId);
    if (!closure) return { outcome: 'not_found' };
    return { outcome: 'ok', detail: await buildDetail(this.deps, closure) };
  }
}

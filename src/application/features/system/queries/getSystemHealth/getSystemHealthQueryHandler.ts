import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { GetSystemHealthQuery, type HealthReport } from './getSystemHealthQuery.js';

/** The same check as `/health` (research §10); the route answers it as data, also when unhealthy. */
export class GetSystemHealthQueryHandler implements IQueryHandler<GetSystemHealthQuery, HealthReport & { checkedAt: Date }> {
  constructor(private readonly deps: { checkHealth: () => Promise<HealthReport>; clock: IClock }) {}

  async handle(_query: GetSystemHealthQuery): Promise<HealthReport & { checkedAt: Date }> {
    const report = await this.deps.checkHealth();
    return { status: report.status, checks: report.checks, checkedAt: this.deps.clock.now() };
  }
}

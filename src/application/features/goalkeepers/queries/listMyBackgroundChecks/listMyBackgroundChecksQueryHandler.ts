import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { BackgroundCheckDependencies } from '../../common/backgroundCheckDependencies.js';
import { toMyBackgroundCheck } from '../../common/vettingViews.js';
import { ListMyBackgroundChecksQuery, type ListMyBackgroundChecksResult } from './listMyBackgroundChecksQuery.js';

export class ListMyBackgroundChecksQueryHandler implements IQueryHandler<ListMyBackgroundChecksQuery, ListMyBackgroundChecksResult> {
  constructor(private readonly deps: Pick<BackgroundCheckDependencies, 'profiles' | 'checks' | 'images' | 'clock'>) {}

  async handle(query: ListMyBackgroundChecksQuery): Promise<ListMyBackgroundChecksResult> {
    if (!(await this.deps.profiles.getByUserId(query.userId))) return { outcome: 'not_a_goalkeeper' };
    const now = this.deps.clock.now();
    const checks = await this.deps.checks.listForGoalkeeper(query.userId);
    const images = await Promise.all(checks.map((check) => this.deps.images.getById(check.imageId)));
    return { outcome: 'ok', items: checks.map((check, index) => toMyBackgroundCheck(check, images[index]?.url ?? null, now)) };
  }
}

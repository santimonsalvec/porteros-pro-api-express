import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { caseItems, ratingView } from '../../common/caseAdminViews.js';
import type { CasesAdminDependencies } from '../../common/casesAdminDependencies.js';
import { GetCaseAdminQuery, type GetCaseAdminResult } from './getCaseAdminQuery.js';

export class GetCaseAdminQueryHandler implements IQueryHandler<GetCaseAdminQuery, GetCaseAdminResult> {
  constructor(private readonly deps: CasesAdminDependencies) {}

  async handle({ caseId }: GetCaseAdminQuery): Promise<GetCaseAdminResult> {
    const item = await this.deps.cases.getById(caseId);
    if (!item) return { outcome: 'case_not_found' };
    const [[view], rating, detail] = await Promise.all([
      caseItems(this.deps, [item]),
      this.deps.ratings.getById(item.ratingId),
      this.deps.requestDetail(item.requestId),
    ]);
    const request = detail.outcome === 'ok' ? detail.request : null;
    return {
      outcome: 'ok',
      case: {
        ...view!,
        rating: ratingView(rating),
        checkIn: item.checkIn ? { at: new Date(item.checkIn.at).toISOString(), distanceMeters: item.checkIn.distanceMeters, hasPhoto: true } : null,
        booking: request?.bookings.find((booking) => booking.bookingId === item.bookingId) ?? null,
        requestStatus: request?.status ?? null,
      },
    };
  }
}

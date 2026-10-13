import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { RequestsAdminDependencies } from '../../common/requestsAdminDependencies.js';
import { GetCheckInPhotoQuery, type GetCheckInPhotoResult } from './getCheckInPhotoQuery.js';

export class GetCheckInPhotoQueryHandler implements IQueryHandler<GetCheckInPhotoQuery, GetCheckInPhotoResult> {
  constructor(private readonly deps: Pick<RequestsAdminDependencies, 'reader'>) {}

  async handle(query: GetCheckInPhotoQuery): Promise<GetCheckInPhotoResult> {
    const found = await this.deps.reader.checkInPhoto(query.bookingId, query.requestId);
    return found.outcome === 'ok' ? { outcome: 'ok', photo: { photoUrl: found.photoUrl, at: found.at.toISOString() } } : found;
  }
}

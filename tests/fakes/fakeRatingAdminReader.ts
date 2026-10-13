import type { IRatingAdminReader, RatingListFilter } from '../../src/application/features/ratings/common/adminPorts.js';
import type { Rating } from '../../src/domain/ratings/rating.js';
import type { FakeBookingLifecycleStore } from './fakeBookingLifecycleStore.js';

/** The admin's rating reads over the in-memory lifecycle store, filtering like `ratingsMatch` (admin spec 006). */
export class FakeRatingAdminReader implements IRatingAdminReader {
  constructor(private readonly lifecycle: FakeBookingLifecycleStore) {}

  async list(filter: RatingListFilter & { page: number; pageSize: number }): Promise<{ items: Rating[]; totalItems: number }> {
    const involves = (rating: Rating, userId: string, ownSide: 'client' | 'goalkeeper') =>
      (rating.authorId === userId && rating.side === ownSide) || (rating.subjectId === userId && rating.side !== ownSide);
    const kept = this.lifecycle
      .ratings()
      .filter((rating) => !filter.goalkeeperId || involves(rating, filter.goalkeeperId, 'goalkeeper'))
      .filter((rating) => !filter.clientId || involves(rating, filter.clientId, 'client'))
      .filter((rating) => !filter.side || rating.side === filter.side)
      .filter((rating) => filter.starsMin === undefined || rating.stars >= filter.starsMin)
      .filter((rating) => filter.starsMax === undefined || rating.stars <= filter.starsMax)
      .filter((rating) => !filter.from || rating.createdAt.getTime() >= filter.from.getTime())
      .filter((rating) => !filter.to || rating.createdAt.getTime() < filter.to.getTime())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
    const start = (filter.page - 1) * filter.pageSize;
    return { items: kept.slice(start, start + filter.pageSize), totalItems: kept.length };
  }

  async casesOpenedBy(ratings: readonly Rating[]): Promise<Map<string, string>> {
    const ids = new Set(ratings.map((rating) => rating.id));
    return new Map(this.lifecycle.cases.all().filter((item) => ids.has(item.ratingId)).map((item) => [item.ratingId, item.id]));
  }
}

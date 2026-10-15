import type { IRatingRepository } from '../../src/application/features/ratings/common/ports.js';
import type { Rating, RatingSide } from '../../src/domain/ratings/rating.js';

/** Reads the ratings the fake lifecycle store writes. */
export class FakeRatingRepository implements IRatingRepository {
  constructor(private readonly ratings: () => readonly Rating[]) {}

  async findByBookingsAndSide(bookingIds: readonly string[], side: RatingSide): Promise<Rating[]> {
    return this.ratings().filter((rating) => bookingIds.includes(rating.bookingId) && rating.side === side);
  }

  async summaryForGoalkeeper(goalkeeperId: string): Promise<{ count: number; average: number | null }> {
    const stars = this.ratings()
      .filter((rating) => rating.subjectId === goalkeeperId && rating.side === 'client')
      .map((rating) => rating.stars);
    return { count: stars.length, average: stars.length > 0 ? stars.reduce((sum, value) => sum + value, 0) / stars.length : null };
  }

  async getById(id: string): Promise<Rating | null> {
    return this.ratings().find((rating) => rating.id === id) ?? null;
  }
}

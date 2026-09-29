import type { IRatingRepository } from '../../src/application/features/ratings/common/ports.js';
import type { Rating, RatingSide } from '../../src/domain/ratings/rating.js';

/** Reads the ratings the fake lifecycle store writes. */
export class FakeRatingRepository implements IRatingRepository {
  constructor(private readonly ratings: () => readonly Rating[]) {}

  async findByBookingsAndSide(bookingIds: readonly string[], side: RatingSide): Promise<Rating[]> {
    return this.ratings().filter((rating) => bookingIds.includes(rating.bookingId) && rating.side === side);
  }

  async getById(id: string): Promise<Rating | null> {
    return this.ratings().find((rating) => rating.id === id) ?? null;
  }
}

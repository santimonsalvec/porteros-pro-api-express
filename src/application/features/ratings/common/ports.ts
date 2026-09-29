import type { Rating, RatingSide } from '../../../../domain/ratings/rating.js';

/** The ratings (feature 021). Written only inside the lifecycle store's rating transaction. */
export interface IRatingRepository {
  findByBookingsAndSide(bookingIds: readonly string[], side: RatingSide): Promise<Rating[]>;
  getById(id: string): Promise<Rating | null>;
}

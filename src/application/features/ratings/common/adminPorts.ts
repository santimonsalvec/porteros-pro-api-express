import type { Rating, RatingSide } from '../../../../domain/ratings/rating.js';

/** The admin's rating filters (admin spec 006, US4). Dates are when the rating was given. */
export interface RatingListFilter {
  /** Ratings the goalkeeper gave or received. */
  goalkeeperId?: string;
  /** Ratings the client gave or received. */
  clientId?: string;
  side?: RatingSide;
  starsMin?: number;
  starsMax?: number;
  from?: Date;
  to?: Date;
}

export interface IRatingAdminReader {
  list(filter: RatingListFilter & { page: number; pageSize: number }): Promise<{ items: Rating[]; totalItems: number }>;
  /** The case each rating opened, by rating id; absent = it opened none. */
  casesOpenedBy(ratings: readonly Rating[]): Promise<Map<string, string>>;
}

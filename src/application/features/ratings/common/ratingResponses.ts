import type { Rating } from '../../../../domain/ratings/rating.js';

export interface RatingResponse {
  ratingId: string;
  bookingId: string;
  side: string;
  answer: boolean;
  stars: number;
  comment: string | null;
  createdAt: string;
}

export function toRatingResponse(rating: Rating): RatingResponse {
  return {
    ratingId: rating.id,
    bookingId: rating.bookingId,
    side: rating.side,
    answer: rating.answer,
    stars: rating.stars,
    comment: rating.comment,
    createdAt: rating.createdAt.toISOString(),
  };
}

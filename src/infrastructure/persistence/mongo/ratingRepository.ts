import type { Collection, Db, Document } from 'mongodb';
import type { IRatingRepository } from '../../../application/features/ratings/common/ports.js';
import { Rating, type RatingSide } from '../../../domain/ratings/rating.js';

export const RATINGS_COLLECTION = 'ratings';

export function ratingToDocument(rating: Rating): Document {
  return {
    _id: rating.id,
    bookingId: rating.bookingId,
    requestId: rating.requestId,
    side: rating.side,
    authorId: rating.authorId,
    subjectId: rating.subjectId,
    answer: rating.answer,
    stars: rating.stars,
    comment: rating.comment,
    createdAt: rating.createdAt,
  };
}

export function ratingFromDocument(doc: Document): Rating {
  return Rating.rehydrate({
    id: String(doc._id),
    bookingId: doc.bookingId as string,
    requestId: doc.requestId as string,
    side: doc.side as RatingSide,
    authorId: doc.authorId as string,
    subjectId: doc.subjectId as string,
    answer: doc.answer as boolean,
    stars: doc.stars as number,
    comment: (doc.comment as string | null | undefined) ?? null,
    createdAt: new Date(doc.createdAt as Date),
  });
}

/** One private rating per side and booking (feature 021); `booking_side_unique` enforces it. */
export class RatingRepository implements IRatingRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(RATINGS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ bookingId: 1, side: 1 }, { name: 'booking_side_unique', unique: true });
    await this.collection.createIndex({ authorId: 1, createdAt: -1 }, { name: 'author_created' });
  }

  async findByBookingsAndSide(bookingIds: readonly string[], side: RatingSide): Promise<Rating[]> {
    if (bookingIds.length === 0) return [];
    const docs = await this.collection.find({ bookingId: { $in: [...bookingIds] }, side }).toArray();
    return docs.map(ratingFromDocument);
  }

  async getById(id: string): Promise<Rating | null> {
    const doc = await this.collection.findOne({ _id: id } as Document);
    return doc ? ratingFromDocument(doc) : null;
  }
}

import type { Collection, Db, Document } from 'mongodb';
import type { IRatingAdminReader, RatingListFilter } from '../../../application/features/ratings/common/adminPorts.js';
import type { Rating } from '../../../domain/ratings/rating.js';
import { CASES_COLLECTION } from './caseRepository.js';
import { ratingsMatch } from './ratingAdminPipelines.js';
import { RATINGS_COLLECTION, ratingFromDocument } from './ratingRepository.js';

/** The admin's reads of ratings (admin spec 006, US4), newest first by `createdAt_id`. */
export class RatingAdminReader implements IRatingAdminReader {
  private readonly ratings: Collection<Document>;
  private readonly cases: Collection<Document>;

  constructor(db: Db) {
    this.ratings = db.collection(RATINGS_COLLECTION);
    this.cases = db.collection(CASES_COLLECTION);
  }

  async list(filter: RatingListFilter & { page: number; pageSize: number }): Promise<{ items: Rating[]; totalItems: number }> {
    const match = ratingsMatch(filter);
    const [docs, totalItems] = await Promise.all([
      this.ratings
        .find(match)
        .sort({ createdAt: -1, _id: -1 })
        .skip((filter.page - 1) * filter.pageSize)
        .limit(filter.pageSize)
        .toArray(),
      this.ratings.countDocuments(match),
    ]);
    return { items: docs.map(ratingFromDocument), totalItems };
  }

  async casesOpenedBy(ratings: readonly Rating[]): Promise<Map<string, string>> {
    if (ratings.length === 0) return new Map();
    const docs = await this.cases
      .find({ bookingId: { $in: [...new Set(ratings.map((rating) => rating.bookingId))] } } as Document, { projection: { _id: 1, ratingId: 1 } })
      .toArray();
    const ids = new Set(ratings.map((rating) => rating.id));
    return new Map(docs.filter((doc) => ids.has(doc.ratingId as string)).map((doc) => [doc.ratingId as string, String(doc._id)]));
  }
}

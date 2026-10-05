import type { Collection, Db, Document } from 'mongodb';
import type { IMatchSurfaceRepository } from '../../../application/features/goalkeeperRequests/common/ports.js';
import { MatchSurface } from '../../../domain/pricing/matchSurface.js';

/**
 * Externally seeded playing surfaces (feature 024; `scripts/seed-match-surfaces.ts`). Read-only
 * here. A malformed document throws, like `rentalRates`, rather than being skipped.
 */
export class MatchSurfaceRepository implements IMatchSurfaceRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('matchSurfaces');
  }

  private fromDocument(doc: Document): MatchSurface {
    return new MatchSurface({
      id: String(doc._id),
      name: doc.name as string,
      active: doc.active as boolean,
      order: doc.order as number,
    });
  }

  async listActive(): Promise<MatchSurface[]> {
    const docs = await this.collection.find({ active: true }).sort({ order: 1, name: 1 }).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async findById(id: string): Promise<MatchSurface | null> {
    const doc = await this.collection.findOne({ _id: id as never });
    return doc ? this.fromDocument(doc) : null;
  }
}

import type { Collection, Db, Document } from 'mongodb';
import type { IRegionRepository } from '../../../application/features/locations/common/ports.js';
import { Region } from '../../../domain/locations/region.js';

/** Pre-existing, externally-owned collection — this system only reads it. */
export class RegionRepository implements IRegionRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('regions');
  }

  private fromDocument(doc: Document): Region {
    return new Region({ id: String(doc._id), name: doc.name as string });
  }

  async getByIds(ids: string[]): Promise<Region[]> {
    if (ids.length === 0) return [];
    const docs = await this.collection.find({ _id: { $in: ids } } as Document).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }
}

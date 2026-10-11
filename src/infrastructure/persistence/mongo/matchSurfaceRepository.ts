import type { Collection, Db, Document } from 'mongodb';
import type { IMatchSurfaceRepository } from '../../../application/features/goalkeeperRequests/common/ports.js';
import type { Found, IAdminMatchSurfaceRepository, PageRequest, UpdateResult } from '../../../application/features/geography/common/ports.js';
import { idFilter } from './idFilter.js';
import { deleteById, updateAtRevision } from './revisionWrite.js';
import { MatchSurface } from '../../../domain/pricing/matchSurface.js';

/**
 * The playing surfaces (feature 024): the quote reads them, the admin web edits them (admin spec
 * 003). A malformed document throws, like `rentalRates`, rather than being skipped.
 */
export class MatchSurfaceRepository implements IMatchSurfaceRepository, IAdminMatchSurfaceRepository {
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
      revision: doc.revision as number | undefined,
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

  async list(query: PageRequest & { active?: boolean }): Promise<Found<MatchSurface>> {
    const filter = query.active === undefined ? {} : { active: query.active };
    const [docs, totalItems] = await Promise.all([
      this.collection.find(filter).sort({ order: 1, _id: 1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).toArray(),
      this.collection.countDocuments(filter),
    ]);
    return { items: docs.map((doc) => this.fromDocument(doc)), totalItems };
  }

  async getById(id: string): Promise<MatchSurface | null> {
    const doc = await this.collection.findOne(idFilter(id));
    return doc ? this.fromDocument(doc) : null;
  }

  async create(surface: MatchSurface): Promise<void> {
    await this.collection.insertOne({ _id: surface.id, name: surface.name, active: surface.active, order: surface.order, revision: 0 } as Document);
  }

  update(surface: MatchSurface): Promise<UpdateResult> {
    return updateAtRevision(this.collection, surface.id, surface.revision, { name: surface.name, active: surface.active, order: surface.order });
  }

  delete(id: string): Promise<boolean> {
    return deleteById(this.collection, id);
  }
}

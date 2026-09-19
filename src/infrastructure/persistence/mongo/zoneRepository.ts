import type { Collection, Db, Document } from 'mongodb';
import type { IZoneRepository } from '../../../application/features/zones/common/ports.js';
import { Zone, type ZoneGeometry } from '../../../domain/zones/zone.js';

/** Pre-existing, externally-owned collection — this system only reads it. */
export class ZoneRepository implements IZoneRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('zones');
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ cityId: 1, active: 1, displayOrder: 1 }, { name: 'cityId_active_displayOrder' });
  }

  private fromDocument(doc: Document): Zone {
    return new Zone({
      id: String(doc._id),
      cityId: doc.cityId as string,
      name: doc.name as string,
      slug: doc.slug as string,
      geometry: doc.geometry as ZoneGeometry,
      active: doc.active as boolean,
      displayOrder: doc.displayOrder as number,
    });
  }

  async getActiveByCityId(anchorCityId: string): Promise<Zone[]> {
    const docs = await this.collection
      .find({ cityId: anchorCityId, active: true })
      .sort({ displayOrder: 1 })
      .toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async getManyByIds(ids: string[]): Promise<Zone[]> {
    if (ids.length === 0) return [];
    const docs = await this.collection.find({ _id: { $in: ids } } as Document).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async hasActiveZonesForCityIds(anchorCityIds: string[]): Promise<Set<string>> {
    if (anchorCityIds.length === 0) return new Set();
    const cityIds = await this.collection.distinct('cityId', { cityId: { $in: anchorCityIds }, active: true });
    return new Set(cityIds as string[]);
  }
}

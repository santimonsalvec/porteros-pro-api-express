import type { Collection, Db, Document } from 'mongodb';
import type { ICommissionSettingRepository } from '../../../application/features/wallet/common/ports.js';
import { CommissionSetting } from '../../../domain/wallet/commissionSetting.js';

/**
 * Externally seeded platform commissions (country, anchor city or zone). Read-only here, like
 * `rentalRates` and `bookingSettings`: one document per scope and reference.
 */
export class CommissionSettingRepository implements ICommissionSettingRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('commissionSettings');
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ scope: 1, refId: 1 }, { name: 'scope_refId', unique: true });
  }

  /** Every setting for any of these zones, anchor cities or countries, in one read. */
  async findFor(refs: { zoneIds: string[]; cityIds: string[]; countryIds: string[] }): Promise<CommissionSetting[]> {
    const or = [
      ...(refs.zoneIds.length > 0 ? [{ scope: 'zone', refId: { $in: refs.zoneIds } }] : []),
      ...(refs.cityIds.length > 0 ? [{ scope: 'city', refId: { $in: refs.cityIds } }] : []),
      ...(refs.countryIds.length > 0 ? [{ scope: 'country', refId: { $in: refs.countryIds } }] : []),
    ];
    if (or.length === 0) return [];
    const docs = await this.collection.find({ $or: or }).toArray();
    return docs.map(
      (doc) =>
        new CommissionSetting({
          id: String(doc._id),
          scope: doc.scope as string,
          refId: String(doc.refId),
          amount: doc.amount as number,
        }),
    );
  }
}

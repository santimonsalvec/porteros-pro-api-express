import type { Collection, Db, Document } from 'mongodb';
import type { IVettingLogRepository } from '../../../application/features/goalkeepers/common/ports.js';
import type { VettingLogEntry } from '../../../domain/goalkeepers/vettingLogEntry.js';

export const VETTING_LOG_COLLECTION = 'goalkeeperVettingLog';

/** The history of validation and verification decisions, per goalkeeper (admin spec 030). */
export class VettingLogRepository implements IVettingLogRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(VETTING_LOG_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ goalkeeperId: 1, at: -1, _id: -1 }, { name: 'goalkeeper_at' });
  }

  async append(entry: VettingLogEntry): Promise<void> {
    await this.collection.insertOne({
      _id: entry.id,
      goalkeeperId: entry.goalkeeperId,
      at: entry.at,
      actor: entry.actor,
      action: entry.action,
      method: entry.method,
      reason: entry.reason,
      details: entry.details,
    } as Document);
  }

  async listForGoalkeeper(goalkeeperId: string, limit: number): Promise<VettingLogEntry[]> {
    const docs = await this.collection.find({ goalkeeperId }).sort({ at: -1, _id: -1 }).limit(limit).toArray();
    return docs.map((doc) => ({
      id: String(doc._id),
      goalkeeperId: doc.goalkeeperId as string,
      at: new Date(doc.at as Date),
      actor: doc.actor as VettingLogEntry['actor'],
      action: doc.action as VettingLogEntry['action'],
      method: (doc.method as VettingLogEntry['method'] | undefined) ?? null,
      reason: (doc.reason as string | null | undefined) ?? null,
      details: (doc.details as Record<string, unknown> | undefined) ?? {},
    }));
  }
}

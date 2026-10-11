import type { Collection, Db, Document } from 'mongodb';
import type { AuditLogQuery, IAdminAuditLog, IAdminAuditLogReader } from '../../../application/features/staff/common/ports.js';
import type { AuditEntry } from '../../../domain/staff/auditEntry.js';
import { dropIndexIfExists } from './dropIndexIfExists.js';

export const ADMIN_AUDIT_LOG_COLLECTION = 'adminAuditLog';

/**
 * The administration audit log: append-only and without expiry (porteros-pro-admin spec 001,
 * FR-024/FR-025). On purpose this class has no way to change or remove an entry.
 */
export class MongoAdminAuditLog implements IAdminAuditLog, IAdminAuditLogReader {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(ADMIN_AUDIT_LOG_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    // Spec 002: newest first with a stable tie-break for the cursor, plus the filter indexes.
    await dropIndexIfExists(this.collection, 'at_desc');
    await this.collection.createIndex({ at: -1, _id: -1 }, { name: 'at_id_desc' });
    await this.collection.createIndex({ 'actor.staffId': 1, at: -1 }, { name: 'actor_at' });
    await this.collection.createIndex({ resourceType: 1, resourceId: 1, at: -1 }, { name: 'resource_at' });
    await this.collection.createIndex({ action: 1, at: -1 }, { name: 'action_at' });
    await this.collection.createIndex({ outcome: 1, at: -1 }, { name: 'outcome_at' });
  }

  async append(entry: AuditEntry): Promise<void> {
    const { id, ...rest } = entry;
    await this.collection.insertOne({ _id: id, ...rest } as Document);
  }

  async list(query: AuditLogQuery): Promise<AuditEntry[]> {
    const filter: Document = {};
    if (query.staffId) filter['actor.staffId'] = query.staffId;
    if (query.resourceType) filter.resourceType = query.resourceType;
    if (query.action) filter.action = query.action;
    if (query.outcome) filter.outcome = query.outcome;
    if (query.from || query.to) filter.at = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    if (query.after) filter.$or = [{ at: { $lt: query.after.at } }, { at: query.after.at, _id: { $lt: query.after.id } }];
    const docs = await this.collection.find(filter).sort({ at: -1, _id: -1 }).limit(query.limit).toArray();
    return docs.map(entryFromDocument);
  }

  async getById(id: string): Promise<AuditEntry | null> {
    const doc = await this.collection.findOne({ _id: id } as Document);
    return doc ? entryFromDocument(doc) : null;
  }
}

function entryFromDocument(doc: Document): AuditEntry {
  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest } as AuditEntry;
}

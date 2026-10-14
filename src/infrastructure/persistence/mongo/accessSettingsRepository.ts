import type { Collection, Db, Document } from 'mongodb';
import type { IAccessSettingsRepository } from '../../../application/features/auth/common/ports.js';
import type { StoredAccessSettings } from '../../../domain/auth/accessSettings.js';
import { updateAtRevision } from './revisionWrite.js';

export const ACCESS_SETTINGS_COLLECTION = 'accessSettings';

const GLOBAL_ID = 'global';
const DUPLICATE_KEY = 11000;

/** The one access configuration (admin spec 009, research §5), always saved at the revision read (FR-025). */
export class MongoAccessSettingsRepository implements IAccessSettingsRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(ACCESS_SETTINGS_COLLECTION);
  }

  async get(): Promise<StoredAccessSettings | null> {
    const doc = await this.collection.findOne({ _id: GLOBAL_ID } as Document);
    if (!doc) return null;
    return {
      loginCodeExpiryMinutes: doc.loginCodeExpiryMinutes as number,
      revision: (doc.revision as number | undefined) ?? 0,
      updatedAt: new Date(doc.updatedAt as Date),
      updatedBy: doc.updatedBy as string,
    };
  }

  async create(settings: Omit<StoredAccessSettings, 'revision'>): Promise<'saved' | 'stale'> {
    try {
      await this.collection.insertOne({ _id: GLOBAL_ID, ...settings, revision: 0 } as Document);
      return 'saved';
    } catch (error) {
      if ((error as { code?: unknown }).code === DUPLICATE_KEY) return 'stale';
      throw error;
    }
  }

  update(settings: Omit<StoredAccessSettings, 'revision'>, expectedRevision: number): Promise<'saved' | 'stale'> {
    return updateAtRevision(this.collection, GLOBAL_ID, expectedRevision, { ...settings });
  }
}

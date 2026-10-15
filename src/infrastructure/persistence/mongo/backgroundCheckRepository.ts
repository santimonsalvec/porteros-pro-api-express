import type { Collection, Db, Document } from 'mongodb';
import type { DeletePendingOutcome, IBackgroundCheckRepository } from '../../../application/features/goalkeepers/common/ports.js';
import { BackgroundCheck, type BackgroundCheckStatus } from '../../../domain/goalkeepers/backgroundCheck.js';
import { updateAtRevision } from './revisionWrite.js';

export const BACKGROUND_CHECKS_COLLECTION = 'goalkeeperBackgroundChecks';

export function backgroundCheckFromDocument(doc: Document): BackgroundCheck {
  return BackgroundCheck.rehydrate({
    id: String(doc._id),
    goalkeeperId: doc.goalkeeperId as string,
    imageId: doc.imageId as string,
    uploadedAt: doc.uploadedAt as Date,
    status: doc.status as BackgroundCheckStatus,
    reviewedAt: (doc.reviewedAt as Date | null | undefined) ?? null,
    reviewedBy: (doc.reviewedBy as string | null | undefined) ?? null,
    rejectionReason: (doc.rejectionReason as string | null | undefined) ?? null,
    expiresAt: (doc.expiresAt as Date | null | undefined) ?? null,
    revision: (doc.revision as number | undefined) ?? 0,
  });
}

/** The criminal background certificates goalkeepers upload (admin spec 030, research §3). */
export class BackgroundCheckRepository implements IBackgroundCheckRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(BACKGROUND_CHECKS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ goalkeeperId: 1, uploadedAt: -1 }, { name: 'goalkeeper_uploaded' });
    // The admin's "to review / expiring / expired" filters.
    await this.collection.createIndex({ status: 1, expiresAt: 1 }, { name: 'status_expires' });
  }

  async add(check: BackgroundCheck): Promise<void> {
    await this.collection.insertOne({
      _id: check.id,
      goalkeeperId: check.goalkeeperId,
      imageId: check.imageId,
      uploadedAt: check.uploadedAt,
      status: check.status,
      reviewedAt: check.reviewedAt,
      reviewedBy: check.reviewedBy,
      rejectionReason: check.rejectionReason,
      expiresAt: check.expiresAt,
      revision: check.revision,
    } as Document);
  }

  async listForGoalkeeper(goalkeeperId: string): Promise<BackgroundCheck[]> {
    const docs = await this.collection.find({ goalkeeperId }).sort({ uploadedAt: -1, _id: -1 }).toArray();
    return docs.map(backgroundCheckFromDocument);
  }

  async findForGoalkeeper(id: string, goalkeeperId: string): Promise<BackgroundCheck | null> {
    const doc = await this.collection.findOne({ _id: id, goalkeeperId } as Document);
    return doc ? backgroundCheckFromDocument(doc) : null;
  }

  async saveReview(check: BackgroundCheck, expectedRevision: number): Promise<'saved' | 'stale'> {
    return updateAtRevision(this.collection, check.id, expectedRevision, {
      status: check.status,
      reviewedAt: check.reviewedAt,
      reviewedBy: check.reviewedBy,
      rejectionReason: check.rejectionReason,
      expiresAt: check.expiresAt,
    });
  }

  async deletePending(id: string, goalkeeperId: string): Promise<DeletePendingOutcome> {
    const result = await this.collection.deleteOne({ _id: id, goalkeeperId, status: 'pending' } as Document);
    if (result.deletedCount > 0) return 'deleted';
    const existing = await this.collection.findOne({ _id: id, goalkeeperId } as Document);
    return existing ? 'reviewed' : 'not_found';
  }
}

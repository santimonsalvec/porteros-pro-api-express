import type { ClientSession, Db, Document } from 'mongodb';
import type { DocumentWriteResult, IdentityDocument, IGoalkeeperDocumentWriter } from '../../../application/features/goalkeepers/common/adminPorts.js';

const DUPLICATE_KEY = 11000;

/** Thrown inside the transaction to abort it when the profile changed since it was read. */
class StaleDocument extends Error {}

/**
 * The document correction of the admin (admin spec 005, research §11): the registration first, whose
 * unique index refuses a document another goalkeeper has, then the profile, only if it still has the
 * values read — both or neither.
 */
export class MongoGoalkeeperDocumentWriter implements IGoalkeeperDocumentWriter {
  constructor(
    private readonly startSession: () => ClientSession,
    private readonly db: Db,
  ) {}

  async correct(userId: string, expected: IdentityDocument, next: IdentityDocument): Promise<DocumentWriteResult> {
    const session = this.startSession();
    try {
      await session.withTransaction(async () => {
        await this.db.collection('goalkeeperRegistrations').updateOne(
          { userId } as Document,
          { $set: { 'identification.documentType': next.documentType, 'identification.documentNumber': next.documentNumber, updatedAt: new Date() } },
          { session },
        );
        const profile = await this.db.collection('goalkeeperProfiles').updateOne({ userId, ...expected } as Document, { $set: { ...next } }, { session });
        if (profile.matchedCount === 0) throw new StaleDocument();
      });
      return 'saved';
    } catch (error) {
      if (error instanceof StaleDocument) return 'stale';
      if ((error as { code?: number }).code === DUPLICATE_KEY) return 'duplicate';
      throw error;
    } finally {
      await session.endSession();
    }
  }
}

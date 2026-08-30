import type { Db, Document } from 'mongodb';
import type { IRefreshTokenRepository } from '../../../application/features/auth/common/ports.js';
import { RefreshToken } from '../../../domain/users/refreshToken.js';
import { MongoRepository } from './mongoRepository.js';

export class RefreshTokenRepository extends MongoRepository<RefreshToken, string> implements IRefreshTokenRepository {
  constructor(db: Db) {
    super(db.collection('refreshTokens'));
  }

  protected toDocument(entity: RefreshToken): Document {
    return {
      _id: entity.id,
      userId: entity.userId,
      tokenHash: entity.tokenHash,
      expiresAt: entity.expiresAt,
      isUsed: entity.isUsed,
      createdAt: entity.createdAt,
    };
  }

  protected fromDocument(doc: Document): RefreshToken {
    return new RefreshToken({
      id: doc._id as string,
      userId: doc.userId as string,
      tokenHash: doc.tokenHash as string,
      expiresAt: new Date(doc.expiresAt as string | Date),
      isUsed: Boolean(doc.isUsed),
      createdAt: new Date(doc.createdAt as string | Date),
    });
  }

  async findActiveByHash(tokenHash: string): Promise<RefreshToken | null> {
    const doc = await this.collection.findOne({
      tokenHash,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });
    return doc ? this.fromDocument(doc) : null;
  }

  /** Partial update (not a full replace) — mirrors the source's `MarkUsedAsync`. */
  async markUsed(id: string): Promise<void> {
    await this.collection.updateOne({ _id: id } as Document, { $set: { isUsed: true } });
  }
}

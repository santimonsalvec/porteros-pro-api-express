import type { Db, Document } from 'mongodb';
import type { ITermsAcceptanceRepository } from '../../../application/features/profile/common/ports.js';
import { TermsAcceptance } from '../../../domain/users/termsAcceptance.js';
import { MongoRepository } from './mongoRepository.js';
import { stripNulls } from './stripNulls.js';

export class TermsAcceptanceRepository extends MongoRepository<TermsAcceptance, string> implements ITermsAcceptanceRepository {
  constructor(db: Db) {
    super(db.collection('termsAcceptances'));
  }

  protected toDocument(entity: TermsAcceptance): Document {
    return stripNulls({
      _id: entity.id,
      userId: entity.userId,
      termsVersion: entity.termsVersion,
      privacyPolicyVersion: entity.privacyPolicyVersion,
      acceptedAt: entity.acceptedAt,
      ipAddress: entity.ipAddress,
      userAgent: entity.userAgent,
    });
  }

  protected fromDocument(doc: Document): TermsAcceptance {
    return new TermsAcceptance({
      id: doc._id as string,
      userId: doc.userId as string,
      termsVersion: doc.termsVersion as string,
      privacyPolicyVersion: doc.privacyPolicyVersion as string,
      acceptedAt: new Date(doc.acceptedAt as string | Date),
      ipAddress: (doc.ipAddress as string | undefined) ?? null,
      userAgent: (doc.userAgent as string | undefined) ?? null,
    });
  }
}

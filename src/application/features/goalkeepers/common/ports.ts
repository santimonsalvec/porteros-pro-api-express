import type { IRepository } from '../../../common/persistence/repository.js';
import type { GoalkeeperRegistration } from '../../../../domain/goalkeepers/goalkeeperRegistration.js';
import type { GoalkeeperProfile } from '../../../../domain/goalkeepers/goalkeeperProfile.js';
import type { DocumentType } from '../../../../domain/goalkeepers/documentType.js';

export interface IGoalkeeperRegistrationRepository extends IRepository<GoalkeeperRegistration, string> {
  getByUserId(userId: string): Promise<GoalkeeperRegistration | null>;
  /** Excludes the caller's own registration so resubmitting an already-owned document isn't flagged as a duplicate. */
  existsByDocument(documentType: string, documentNumber: string, excludeUserId?: string): Promise<boolean>;
}

export interface IGoalkeeperProfileRepository extends IRepository<GoalkeeperProfile, string> {
  getByUserId(userId: string): Promise<GoalkeeperProfile | null>;
}

/** Minimal, read-only — mirrors `ICountryRepository`'s reference-data shape, no write capability needed. */
export interface IDocumentTypeRepository {
  getAll(): Promise<DocumentType[]>;
  findByCode(code: string): Promise<DocumentType | null>;
}

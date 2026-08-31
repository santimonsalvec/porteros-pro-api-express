import type { IRepository } from '../../../common/persistence/repository.js';
import type { PorteroRegistration } from '../../../../domain/porteros/porteroRegistration.js';
import type { PorteroProfile } from '../../../../domain/porteros/porteroProfile.js';
import type { DocumentType } from '../../../../domain/porteros/documentType.js';

export interface IPorteroRegistrationRepository extends IRepository<PorteroRegistration, string> {
  getByUserId(userId: string): Promise<PorteroRegistration | null>;
  /** Excludes the caller's own registration so resubmitting an already-owned document isn't flagged as a duplicate. */
  existsByDocument(documentType: string, documentNumber: string, excludeUserId?: string): Promise<boolean>;
}

export interface IPorteroProfileRepository extends IRepository<PorteroProfile, string> {
  getByUserId(userId: string): Promise<PorteroProfile | null>;
}

/** Minimal, read-only — mirrors `ICountryRepository`'s reference-data shape, no write capability needed. */
export interface IDocumentTypeRepository {
  getAll(): Promise<DocumentType[]>;
  findByCode(code: string): Promise<DocumentType | null>;
}

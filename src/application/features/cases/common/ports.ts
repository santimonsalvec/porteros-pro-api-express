import type { CaseResolution, CaseStatus, SupportCase } from '../../../../domain/cases/case.js';

/** The cases for manual review (feature 021). Opened inside the rating transaction. */
export interface ICaseRepository {
  /** Open first, then newest first. */
  list(status: CaseStatus | null, skip: number, limit: number): Promise<SupportCase[]>;
  count(status: CaseStatus | null): Promise<number>;
  getById(id: string): Promise<SupportCase | null>;
  resolve(id: string, resolution: CaseResolution): Promise<'resolved' | 'already_resolved' | 'not_found'>;
}

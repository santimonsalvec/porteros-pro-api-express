import type { CaseResolution, CaseStatus, CaseType, SupportCase } from '../../../../domain/cases/case.js';

/** The admin's case filters (admin spec 006, US2). `requestIds` is a country resolved first. */
export interface CaseListFilter {
  status: CaseStatus | null;
  type?: CaseType;
  /** Opening date, `from` included, `to` excluded. */
  from?: Date;
  to?: Date;
  requestIds?: readonly string[];
  /** `default`: open first, then newest (021); `oldest`: oldest first. */
  order: 'default' | 'oldest';
}

/** The cases for manual review (feature 021). Opened inside the rating transaction. */
export interface ICaseRepository {
  /** Open first, then newest first. */
  list(status: CaseStatus | null, skip: number, limit: number): Promise<SupportCase[]>;
  count(status: CaseStatus | null): Promise<number>;
  getById(id: string): Promise<SupportCase | null>;
  resolve(id: string, resolution: CaseResolution): Promise<'resolved' | 'already_resolved' | 'not_found'>;
  /** The admin's search (admin spec 006): the same cases, with more filters and an order. */
  search(filter: CaseListFilter, skip: number, limit: number): Promise<SupportCase[]>;
  countMatching(filter: CaseListFilter): Promise<number>;
  /** The requests of the matching cases, to narrow them to a country. */
  requestIdsMatching(filter: CaseListFilter): Promise<string[]>;
  /** The cases still open in which the user is the client or the goalkeeper (feature 029). */
  findOpenForParticipant(userId: string): Promise<SupportCase[]>;
}

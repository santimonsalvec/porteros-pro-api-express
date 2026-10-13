import type { TopUp, TopUpCheck, TopUpStatus } from '../../../../domain/payments/topUp.js';

/** The admin's top-up filters (admin spec 007, FR-003). Dates bound `createdAt`: `[from, to)`. */
export interface TopUpAdminFilter {
  status?: TopUpStatus;
  countryId?: string;
  goalkeeperId?: string;
  from?: Date;
  to?: Date;
}

/** A top-up with the checks its document keeps beside the entity (FR-005). */
export interface TopUpAdminRecord {
  topUp: TopUp;
  checkLog: TopUpCheck[];
}

export interface ITopUpAdminReader {
  list(filter: TopUpAdminFilter & { page: number; pageSize: number }): Promise<{ items: TopUp[]; totalItems: number }>;
  count(filter: TopUpAdminFilter): Promise<number>;
  /** Every match, newest first, at most `limit` (the export). */
  all(filter: TopUpAdminFilter, limit: number): Promise<TopUp[]>;
  get(topUpId: string): Promise<TopUpAdminRecord | null>;
}

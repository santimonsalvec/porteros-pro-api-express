import type { Deposit, DepositCheck, DepositStatus } from '../../../../domain/deposits/deposit.js';

/** The admin's deposit filters (admin spec 007, FR-003). Dates bound `createdAt`: `[from, to)`. */
export interface DepositAdminFilter {
  status?: DepositStatus;
  countryId?: string;
  /** Spec 031: only these markets (a member who holds just some of them, or `?marketId=`). */
  marketIds?: readonly string[];
  goalkeeperId?: string;
  from?: Date;
  to?: Date;
}

/** A deposit with the checks its document keeps beside the entity (FR-005). */
export interface DepositAdminRecord {
  deposit: Deposit;
  checkLog: DepositCheck[];
}

export interface IDepositAdminReader {
  list(filter: DepositAdminFilter & { page: number; pageSize: number }): Promise<{ items: Deposit[]; totalItems: number }>;
  count(filter: DepositAdminFilter): Promise<number>;
  /** Every match, newest first, at most `limit` (the export). */
  all(filter: DepositAdminFilter, limit: number): Promise<Deposit[]>;
  get(depositId: string): Promise<DepositAdminRecord | null>;
}

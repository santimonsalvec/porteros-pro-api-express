/** The admin's operating balance filters (admin spec 007, FR-001); only operating balances that exist (one movement or more). */
export interface OperatingBalanceAdminFilter {
  countryId?: string;
  /** Spec 031: only these markets (a member who holds just some of them, or `?marketId=`). */
  marketIds?: readonly string[];
  /** Debts only: a balance below zero. */
  negative?: boolean;
  sort: 'balance_asc' | 'balance_desc';
}

export interface OperatingBalanceAdminRecord {
  goalkeeperId: string;
  currency: string;
  balance: number;
  /** The operating balance changes with each movement, so its `updatedAt` is the last one. */
  lastMovementAt: Date;
  /** From the goalkeeper's profile; `null` when it has none. */
  marketId: string | null;
}

export interface IOperatingBalanceAdminReader {
  list(filter: OperatingBalanceAdminFilter & { page: number; pageSize: number }): Promise<{ items: OperatingBalanceAdminRecord[]; totalItems: number }>;
}

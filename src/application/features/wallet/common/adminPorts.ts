/** The admin's wallet filters (admin spec 007, FR-001); only wallets that exist (one movement or more). */
export interface WalletAdminFilter {
  countryId?: string;
  /** Debts only: a balance below zero. */
  negative?: boolean;
  sort: 'balance_asc' | 'balance_desc';
}

export interface WalletAdminRecord {
  goalkeeperId: string;
  currency: string;
  balance: number;
  /** The wallet changes with each movement, so its `updatedAt` is the last one. */
  lastMovementAt: Date;
  /** From the goalkeeper's profile; `null` when it has none. */
  cityId: string | null;
}

export interface IWalletAdminReader {
  list(filter: WalletAdminFilter & { page: number; pageSize: number }): Promise<{ items: WalletAdminRecord[]; totalItems: number }>;
}

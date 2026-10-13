import type { Document } from 'mongodb';
import type { WalletAdminFilter } from '../../../application/features/wallet/common/adminPorts.js';

/** The `find` filter of the admin's wallets (admin spec 007, research §4): a country's goalkeepers, debts. */
export function walletAdminFilter(filter: { goalkeeperIds?: readonly string[]; negative?: boolean }): Document {
  const match: Document = {};
  if (filter.goalkeeperIds) match._id = { $in: [...filter.goalkeeperIds] };
  if (filter.negative) match.balance = { $lt: 0 };
  return match;
}

/** By balance either way, ties by goalkeeper (index `balance_id`). */
export function walletAdminSort(sort: WalletAdminFilter['sort']): { balance: 1 | -1; _id: 1 } {
  return { balance: sort === 'balance_desc' ? -1 : 1, _id: 1 };
}

import type { Document } from 'mongodb';
import type { OperatingBalanceAdminFilter } from '../../../application/features/operatingBalance/common/adminPorts.js';

/** The `find` filter of the admin's operating balances (admin spec 007, research §4): a country's goalkeepers, debts. */
export function operatingBalanceAdminFilter(filter: { goalkeeperIds?: readonly string[]; negative?: boolean }): Document {
  const match: Document = {};
  if (filter.goalkeeperIds) match._id = { $in: [...filter.goalkeeperIds] };
  if (filter.negative) match.balance = { $lt: 0 };
  return match;
}

/** By balance either way, ties by goalkeeper (index `balance_id`). */
export function operatingBalanceAdminSort(sort: OperatingBalanceAdminFilter['sort']): { balance: 1 | -1; _id: 1 } {
  return { balance: sort === 'balance_desc' ? -1 : 1, _id: 1 };
}

import type { Document } from 'mongodb';
import type { DepositAdminFilter } from '../../../application/features/payments/common/adminPorts.js';

/** Newest first, with a stable tie-break (indexes `created_id`, `status_created`, `country_created`, `goalkeeper_created`). */
export const DEPOSIT_ADMIN_SORT = { createdAt: -1, _id: -1 } as const;

/** The `find` filter of the admin's deposit list (admin spec 007, research §3); dates are `[from, to)`. */
export function depositAdminFilter(filter: DepositAdminFilter): Document {
  const match: Document = {};
  if (filter.status) match.status = filter.status;
  if (filter.countryId) match.countryId = filter.countryId;
  if (filter.marketIds) match.marketId = { $in: [...filter.marketIds] };
  if (filter.goalkeeperId) match.goalkeeperId = filter.goalkeeperId;
  if (filter.from || filter.to) {
    match.createdAt = { ...(filter.from ? { $gte: filter.from } : {}), ...(filter.to ? { $lt: filter.to } : {}) };
  }
  return match;
}

import type { Document } from 'mongodb';
import type { TopUpAdminFilter } from '../../../application/features/payments/common/adminPorts.js';

/** Newest first, with a stable tie-break (indexes `created_id`, `status_created`, `country_created`, `goalkeeper_created`). */
export const TOP_UP_ADMIN_SORT = { createdAt: -1, _id: -1 } as const;

/** The `find` filter of the admin's top-up list (admin spec 007, research §3); dates are `[from, to)`. */
export function topUpAdminFilter(filter: TopUpAdminFilter): Document {
  const match: Document = {};
  if (filter.status) match.status = filter.status;
  if (filter.countryId) match.countryId = filter.countryId;
  if (filter.goalkeeperId) match.goalkeeperId = filter.goalkeeperId;
  if (filter.from || filter.to) {
    match.createdAt = { ...(filter.from ? { $gte: filter.from } : {}), ...(filter.to ? { $lt: filter.to } : {}) };
  }
  return match;
}

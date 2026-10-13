import type { Document } from 'mongodb';
import type { DocumentAdminFilter } from '../../../application/features/invoicing/common/adminPorts.js';

const STALE_MS = 24 * 60 * 60_000;

/** Oldest first, as the list has always been (feature 023): what waits longest is seen first. */
export const DOCUMENT_ADMIN_SORT = { createdAt: 1, _id: 1 } as const;

/**
 * The `find` filter of the admin's document list (admin spec 007, research §5). Without the new
 * filters it is the list's old one; `stale` is `isStale` (not final and created more than 24 h ago).
 */
export function documentAdminFilter(filter: DocumentAdminFilter, now: Date): Document {
  const match: Document = {};
  if (filter.status) match.status = filter.status;
  if (filter.kind) match.kind = filter.kind;
  if (filter.countryId) match.countryId = filter.countryId;
  if (filter.from || filter.to) {
    match.occurredAt = { ...(filter.from ? { $gte: filter.from } : {}), ...(filter.to ? { $lt: filter.to } : {}) };
  }
  if (filter.stale) {
    match.$and = [{ status: { $in: ['pending', 'awaiting_authority'] } }, { createdAt: { $lt: new Date(now.getTime() - STALE_MS) } }];
  }
  return match;
}

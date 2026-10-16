import { z } from 'zod';
import { pageQuery } from '../geography/geographyRequests.js';
import { FROM_BEFORE_TO, fromBeforeTo, instantField } from './financeFilters.js';

const DOCUMENT_STATUSES = ['pending', 'awaiting_authority', 'issued', 'rejected'] as const;

const filters = {
  status: z.enum(DOCUMENT_STATUSES).optional(),
  kind: z.enum(['invoice', 'credit_note']).optional(),
  // The country comes from X-Scope (spec 031, contract B1); `marketId` narrows it.
  marketId: z.string().trim().min(1).max(100).optional(),
  from: instantField.optional(),
  to: instantField.optional(),
  stale: z.enum(['true']).transform(() => true).optional(),
};

/** `GET /admin/invoicing/documents` (feature 023, widened by admin spec 007, contracts/finance-api.md §6). */
export const listDocumentsAdminQuerySchema = z.object({ ...pageQuery, ...filters }).strict().refine(fromBeforeTo, FROM_BEFORE_TO);

/** `GET /admin/invoicing/documents/export` (§7): the same filters, no pages. */
export const exportDocumentsQuerySchema = z.object(filters).strict().refine(fromBeforeTo, FROM_BEFORE_TO);

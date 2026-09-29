import { z } from 'zod';

/** A country's VAT rate in basis points (contracts §3b). */
export const taxSettingsRequestSchema = z
  .object({
    vatRateBps: z
      .number({ required_error: 'vatRateBps is required', invalid_type_error: 'vatRateBps must be a number' })
      .int('vatRateBps must be a whole number')
      .min(0, 'vatRateBps must be at least 0')
      .max(10000, 'vatRateBps must be at most 10000'),
  })
  .strict();

/**
 * A country's invoicing provider (contracts §3). Only the shape is checked here; the domain checks
 * each provider's configuration and refuses any unknown key, so no secret can be stored.
 */
export const invoicingSettingsRequestSchema = z
  .object({
    provider: z.string({ required_error: 'provider is required', invalid_type_error: 'provider must be a string' }),
    config: z.record(z.unknown(), { required_error: 'config is required', invalid_type_error: 'config must be an object' }),
  })
  .strict();

export const DOCUMENT_STATUSES = ['pending', 'awaiting_authority', 'issued', 'rejected'] as const;

/** The administrators' document list (contracts §2). */
export const listDocumentsQuerySchema = z.object({
  status: z.enum(DOCUMENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

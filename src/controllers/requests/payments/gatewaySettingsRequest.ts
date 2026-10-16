import { z } from 'zod';
import { revisionField } from '../geography/geographyRequests.js';

const integer = (field: string) =>
  z.number({ required_error: `${field} is required`, invalid_type_error: `${field} must be a number` }).int(`${field} must be a whole number`);

/**
 * A country's gateway settings (contracts §7). Only the shape is checked here; the domain checks
 * the rules (supported gateway, key prefix, ranges, amounts). A secret has no field to go in.
 * `revision` is required (admin spec 007, FR-025): the one read, or `null` to create the country's first.
 */
export const gatewaySettingsRequestSchema = z
  .object({
    revision: revisionField.nullable(),
    gateway: z.string({ required_error: 'gateway is required', invalid_type_error: 'gateway must be a string' }),
    publicConfig: z
      .object({
        publicKey: z.string({ required_error: 'publicKey is required', invalid_type_error: 'publicKey must be a string' }).trim().min(1),
        environment: z.enum(['sandbox', 'production'], { errorMap: () => ({ message: 'environment must be sandbox or production' }) }),
      })
      .strict(),
    costs: z.object({ percentBps: integer('percentBps'), fixed: integer('fixed'), vatBps: integer('vatBps') }).strict(),
    amounts: z.array(integer('amounts'), { required_error: 'amounts is required', invalid_type_error: 'amounts must be a list' }),
  })
  .strict();

export type GatewaySettingsRequest = z.infer<typeof gatewaySettingsRequestSchema>;

/** `GET /admin/payment-gateways?countryId=` (spec 031, contract E). */
export const gatewaySettingsListQuerySchema = z.object({ countryId: z.string({ required_error: 'countryId is required' }).trim().min(1) }).strict();

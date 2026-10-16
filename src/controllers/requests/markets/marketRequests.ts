import { z } from 'zod';
import { MARKET_STATUSES } from '../../../domain/markets/market.js';
import { optionalReasonField } from '../geography/geographyRequests.js';

/** `GET /admin/markets` (spec 031, contract §C). */
export const listMarketsQuerySchema = z.object({ status: z.enum(MARKET_STATUSES).optional(), countryId: z.string().min(1).optional() }).strict();

/** `POST /admin/markets`: the command checks the country, the time zone and the name. */
export const createMarketRequestSchema = z
  .object({ name: z.string().trim(), countryId: z.string().trim().min(1), timeZone: z.string().trim().min(1) })
  .strict();

/** `PATCH /admin/markets/:marketId`: what changes, plus the revision read. `countryId` is refused by the command. */
export const updateMarketRequestSchema = z
  .object({
    revision: z.number().int().min(0),
    name: z.string().trim().optional(),
    timeZone: z.string().trim().min(1).optional(),
    countryId: z.string().trim().min(1).optional(),
  })
  .strict();

const revision = z.number({ required_error: 'revision is required' }).int().min(0);

/** `POST /admin/markets/:marketId/enable` and `…/delete`: the revision read. */
export const marketRevisionRequestSchema = z.object({ revision }).strict();

/** `POST /admin/markets/:marketId/disable`: the reason is required by the command. */
export const disableMarketRequestSchema = z.object({ revision, reason: optionalReasonField }).strict();

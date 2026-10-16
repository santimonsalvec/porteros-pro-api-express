import { z } from 'zod';

const text = z.string({ invalid_type_error: 'Must be text.' });

/** `PATCH /goalkeepers/me/billing`: the draft's billing data, any field (spec 031, contract A6). */
export const saveBillingSectionRequestSchema = z
  .object({ cityId: text.optional(), address: text.optional(), addressComplement: text.nullable().optional() })
  .strict();

/** `PUT /goalkeepers/me/profile/billing`: an active goalkeeper's whole billing data (contract A7). */
export const updateGoalkeeperBillingRequestSchema = z
  .object({ cityId: text.min(1), address: text, addressComplement: text.nullable().optional() })
  .strict();

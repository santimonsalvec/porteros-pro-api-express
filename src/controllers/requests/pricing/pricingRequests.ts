import { z } from 'zod';
import { PRICED_MODALITIES } from '../../../domain/bookings/matchFormat.js';
import { acknowledgeWarningsField, deleteRequestSchema, pageQuery, revisionField } from '../geography/geographyRequests.js';

/**
 * Request schemas of the admin's prices and booking rules (admin spec 004, contracts/pricing-api.md).
 * zod checks shapes; the domain rules (`tierIssues`, `bookingSettingsIssues`, `adminLimits`) check
 * values, so every rule lives in one place.
 */

export { acknowledgeWarningsField, deleteRequestSchema, revisionField };

export const modalityField = z.enum(PRICED_MODALITIES).nullable();
export const durationField = z.union([z.literal(60), z.literal(90), z.literal(120)], {
  errorMap: () => ({ message: 'Must be 60, 90 or 120.' }),
});
export const amountField = z
  .number({ required_error: 'amount is required', invalid_type_error: 'amount must be a number' })
  .int('Must be a whole number.')
  .min(1, 'Must be greater than 0.');

export const refIdField = z.string({ required_error: 'refId is required', invalid_type_error: 'refId must be a string' }).min(1);

/** `YYYY-MM-DDTHH:mm`, read in the city's own time zone by the server. */
export const localDateTimeField = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Must be YYYY-MM-DDTHH:mm.');

const optionalId = z.string().min(1).optional();

/** The filters shared by the rate and commission lists. */
export const priceListQuery = {
  ...pageQuery,
  countryId: optionalId,
  marketId: optionalId,
  zoneId: optionalId,
  modality: z.enum([...PRICED_MODALITIES, 'general']).optional(),
};

export const durationQueryField = z.enum(['60', '90', '120']).transform(Number).optional();

/** `GET /admin/rental-rates`. */
export const listRentalRatesQuerySchema = z.object({ ...priceListQuery, durationMinutes: durationQueryField }).strict();

/** `POST /admin/rental-rates`. */
export const createRentalRateRequestSchema = z
  .object({
    scope: z.enum(['zone', 'market']),
    refId: refIdField,
    durationMinutes: durationField,
    modality: modalityField.default(null),
    amount: amountField,
  })
  .strict();

/** `PATCH /admin/rental-rates/:id` and `/admin/commissions/:id`: only the amount changes (research §6). */
export const updatePriceRequestSchema = z.object({ revision: revisionField, amount: amountField }).strict();

/** `GET /admin/commissions`. */
export const listCommissionsQuerySchema = z.object({ ...priceListQuery, scope: z.enum(['country', 'market', 'zone']).optional() }).strict();

/** `POST /admin/commissions`. */
export const createCommissionRequestSchema = z
  .object({
    scope: z.enum(['country', 'market', 'zone']),
    refId: refIdField,
    modality: modalityField.default(null),
    amount: amountField,
  })
  .strict();

const minutes = z.number({ invalid_type_error: 'Must be a number.' }).nullable();
const required = <T extends z.ZodTypeAny>(schema: T, field: string) =>
  z.union([schema, z.null()], { required_error: `${field} is required (null = not set)` });

const surchargeField = z
  .object({
    tiers: z.array(
      z
        .object({
          fromMinutes: z.number({ required_error: 'fromMinutes is required' }),
          toMinutes: z.number().nullable(),
          amount: z.number({ required_error: 'amount is required' }),
        })
        .strict(),
    ),
  })
  .strict();

const checkInWindowField = z.object({ opensMinutesBefore: minutes, closesMinutesAfter: minutes }).strict();

/** The rules a market may override, every one present: `null` = inherits (research §8; spec 031, FR-014). */
const marketRuleFields = {
  revision: revisionField.nullable(),
  bookingWindowDays: required(minutes.unwrap(), 'bookingWindowDays'),
  minNoticeMinutes: required(minutes.unwrap(), 'minNoticeMinutes'),
  freeCancellationMinutes: required(minutes.unwrap(), 'freeCancellationMinutes'),
  travelBufferMinutes: required(minutes.unwrap(), 'travelBufferMinutes'),
  leadTimeSurcharge: required(surchargeField, 'leadTimeSurcharge'),
  checkInWindow: required(checkInWindowField, 'checkInWindow'),
  noShowGraceMinutes: required(minutes.unwrap(), 'noShowGraceMinutes'),
  offerReminderIntervalMinutes: required(minutes.unwrap(), 'offerReminderIntervalMinutes'),
  offerMaxReminders: required(minutes.unwrap(), 'offerMaxReminders'),
  acknowledgeWarnings: acknowledgeWarningsField,
};

/** `PUT /admin/booking-settings/countries/:countryId`: every value of the country, `null` = not set. */
export const countryBookingSettingsRequestSchema = z
  .object({
    ...marketRuleFields,
    goalkeeperPenalties: required(
      z
        .object({
          lateNoticeMinutes: minutes,
          lateSuspensionDays: minutes,
          weeklyLimit: minutes,
          windowDays: minutes,
          limitSuspensionDays: minutes,
        })
        .strict(),
      'goalkeeperPenalties',
    ),
  })
  .strict();

/** A value only a country sets (FR-014): the market's field answers `field_not_allowed_at_level`. */
const countryOnly = z.undefined({ invalid_type_error: 'field_not_allowed_at_level' });

/** `PUT /admin/booking-settings/markets/:marketId`: what the market overrides; country-only rules are refused on their field. */
export const marketBookingSettingsRequestSchema = z.object({ ...marketRuleFields, goalkeeperPenalties: countryOnly }).strict();

/** `GET /admin/pricing/preview`. */
export const pricingPreviewQuerySchema = z
  .object({
    zoneId: z.string({ required_error: 'zoneId is required' }).min(1),
    durationMinutes: z.enum(['60', '90', '120'], { required_error: 'durationMinutes is required' }).transform(Number),
    modality: z.enum([...PRICED_MODALITIES, 'any']),
    startsAtLocal: localDateTimeField,
    quoteFromLocal: localDateTimeField.optional(),
  })
  .strict();

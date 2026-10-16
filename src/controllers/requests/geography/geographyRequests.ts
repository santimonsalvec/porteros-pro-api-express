import { z } from 'zod';

/**
 * Request schemas of the admin's geography and catalogs (spec 003, contracts/geography-api.md).
 * zod checks shapes and ranges; the domain and the commands check the business rules.
 */

/** A query-string whole number within bounds, with a default; digits only. */
const wholeNumber = (defaultValue: number, min: number, max: number) =>
  z
    .string({ invalid_type_error: 'Must be a whole number.' })
    .regex(/^\d+$/, 'Must be a whole number.')
    .default(String(defaultValue))
    .transform(Number)
    .pipe(z.number().int().min(min, `Must be at least ${min}.`).max(max, `Must be at most ${max}.`));

export const pageQuery = {
  page: wholeNumber(1, 1, 100000),
  pageSize: wholeNumber(20, 1, 50),
};

/** A name prefix to search by. */
export const searchField = z.string().trim().min(1).max(80).optional();

/** The `revision` an edit read (research §5). */
export const revisionField = z
  .number({ required_error: 'revision is required', invalid_type_error: 'revision must be a number' })
  .int('Must be a whole number.')
  .min(0, 'Must be at least 0.');

export const acknowledgeWarningsField = z.boolean({ invalid_type_error: 'acknowledgeWarnings must be a boolean' }).optional();

const reason = z
  .string({ required_error: 'reason is required', invalid_type_error: 'reason must be a string' })
  .trim()
  .min(3, 'Must be 3–300 characters.')
  .max(300, 'Must be 3–300 characters.');

/** Required where the command asks for it (deactivating, a geometry change in use). */
export const optionalReasonField = reason.optional();

/** `POST …/:id/delete`. */
export const deleteRequestSchema = z.object({ reason }).strict();

const name = (max: number) =>
  z
    .string({ required_error: 'name is required', invalid_type_error: 'name must be a string' })
    .trim()
    .min(2, `Must be 2–${max} characters.`)
    .max(max, `Must be 2–${max} characters.`);

const id = (field: string) => z.string({ required_error: `${field} is required`, invalid_type_error: `${field} must be a string` }).min(1);

/** Text or null; an empty text counts as null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === '' ? null : value));

const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

/** `GET /admin/cities`. */
export const listCitiesQuerySchema = z.object({
  countryId: z.string().min(1).optional(),
  regionId: z.string().min(1).optional(),
  q: searchField,
  ...pageQuery,
});

const cityFields = {
  name: name(80),
  regionId: id('regionId'),
  daneStateCode: optionalText(2).default(null),
  daneCityCode: optionalText(5).default(null),
};

/** `POST /admin/cities`: a municipality of the billing catalog; the command checks the region and DANE codes. */
export const createCityRequestSchema = z.object(cityFields).strict();

/** `PATCH /admin/cities/:cityId`: only what changes, plus the revision read. */
export const updateCityRequestSchema = z
  .object({
    revision: revisionField,
    name: cityFields.name.optional(),
    regionId: cityFields.regionId.optional(),
    daneStateCode: optionalText(2).optional(),
    daneCityCode: optionalText(5).optional(),
  })
  .strict();

/** A GeoJSON geometry's shape; the domain checks the polygon itself (`zoneGeometry.ts`). */
const geometry = z.object(
  { type: z.string({ required_error: 'type is required' }), coordinates: z.array(z.unknown(), { required_error: 'coordinates is required' }) },
  { required_error: 'geometry is required', invalid_type_error: 'geometry must be a GeoJSON object' },
);

const slug = z
  .string({ required_error: 'slug is required', invalid_type_error: 'slug must be a string' })
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, digits and single hyphens.')
  .min(2, 'Must be 2–60 characters.')
  .max(60, 'Must be 2–60 characters.');

const displayOrder = z.number({ required_error: 'displayOrder is required', invalid_type_error: 'displayOrder must be a number' }).int().min(0).max(9999);

/** `GET /admin/zones`. */
export const listZonesQuerySchema = z.object({ marketId: id('marketId') });

/** `POST /admin/zones/validate`. */
export const validateZoneRequestSchema = z
  .object({ marketId: id('marketId'), geometry, zoneId: z.string().min(1).optional(), active: z.boolean().optional() })
  .strict();

/** `POST /admin/zones`. */
export const createZoneRequestSchema = z
  .object({
    marketId: id('marketId'),
    name: name(80),
    slug,
    geometry,
    active: z.boolean({ required_error: 'active is required' }),
    displayOrder,
  })
  .strict();

/** `POST /admin/zones/reorder`: every zone of the market, in the new order, at the revision read. */
export const reorderZonesRequestSchema = z
  .object({
    marketId: id('marketId'),
    zones: z
      .array(z.object({ id: id('id'), revision: revisionField }).strict(), { required_error: 'zones is required' })
      .min(1, 'At least one zone.')
      .max(500, 'At most 500 zones.')
      .refine((zones) => new Set(zones.map((zone) => zone.id)).size === zones.length, 'Each zone only once.'),
  })
  .strict();

/** `PATCH /admin/zones/:zoneId`: the market of a zone never changes (FR-002a). */
export const updateZoneRequestSchema = z
  .object({
    revision: revisionField,
    name: name(80).optional(),
    slug: slug.optional(),
    geometry: geometry.optional(),
    active: z.boolean().optional(),
    displayOrder: displayOrder.optional(),
    reason: optionalReasonField,
    marketId: id('marketId').optional(),
  })
  .strict();

/** `GET /admin/readiness`: a country's dashboard or one market, never both. */
export const readinessQuerySchema = z
  .object({ countryId: z.string().min(1).optional(), marketId: z.string().min(1).optional() })
  .refine((query) => (query.countryId === undefined) !== (query.marketId === undefined), {
    message: 'Send either countryId or marketId.',
    path: ['countryId'],
  });

const countryCode = z
  .string({ required_error: 'countryCode is required', invalid_type_error: 'countryCode must be a string' })
  .regex(/^[A-Za-z]{2}$/, 'Two letters (ISO 3166-1 alpha-2).');
const dialCode = z
  .string({ required_error: 'dialCode is required', invalid_type_error: 'dialCode must be a string' })
  .regex(/^\+[0-9]{1,4}$/, 'A plus sign and 1 to 4 digits.');
const currency = z.string().regex(/^[A-Z]{3}$/, 'Three capital letters (ISO 4217).').nullable();

/** `GET /admin/countries`. */
export const listCountriesQuerySchema = z.object({ q: searchField, ...pageQuery });

/** `POST /admin/countries`. */
export const createCountryRequestSchema = z
  .object({ name: name(80), countryCode, dialCode, currency: currency.default(null), acknowledgeWarnings: acknowledgeWarningsField })
  .strict();

/** `PATCH /admin/countries/:countryId`. */
export const updateCountryRequestSchema = z
  .object({
    revision: revisionField,
    name: name(80).optional(),
    countryCode: countryCode.optional(),
    dialCode: dialCode.optional(),
    currency: currency.optional(),
    acknowledgeWarnings: acknowledgeWarningsField,
  })
  .strict();

/** `GET /admin/regions`. */
export const listRegionsQuerySchema = z.object({ countryId: z.string().min(1).optional(), q: searchField, ...pageQuery });

/** `POST /admin/regions`. */
export const createRegionRequestSchema = z.object({ name: name(80), countryId: id('countryId') }).strict();

/** `PATCH /admin/regions/:regionId`. */
export const updateRegionRequestSchema = z
  .object({ revision: revisionField, name: name(80).optional(), countryId: id('countryId').optional() })
  .strict();

const documentTypeCode = z
  .string({ required_error: 'code is required', invalid_type_error: 'code must be a string' })
  .regex(/^[A-Za-z0-9_]{2,40}$/, 'Letters, digits and underscores; 2 to 40 characters.');

/** `GET /admin/document-types`. */
export const listDocumentTypesQuerySchema = z.object({ q: searchField, ...pageQuery });

/** `POST /admin/document-types`. */
export const createDocumentTypeRequestSchema = z
  .object({ code: documentTypeCode, name: name(80), acknowledgeWarnings: acknowledgeWarningsField })
  .strict();

/** `PATCH /admin/document-types/:documentTypeId`. */
export const updateDocumentTypeRequestSchema = z
  .object({ revision: revisionField, code: documentTypeCode.optional(), name: name(80).optional(), acknowledgeWarnings: acknowledgeWarningsField })
  .strict();

const surfaceOrder = z.number({ required_error: 'order is required', invalid_type_error: 'order must be a number' }).int().min(0).max(9999);

/** `GET /admin/match-surfaces`. */
export const listMatchSurfacesQuerySchema = z.object({ active: booleanQuery.optional(), ...pageQuery });

/** `POST /admin/match-surfaces`. */
export const createMatchSurfaceRequestSchema = z
  .object({ name: name(60), active: z.boolean({ required_error: 'active is required' }), order: surfaceOrder })
  .strict();

/** `PATCH /admin/match-surfaces/:surfaceId`. */
export const updateMatchSurfaceRequestSchema = z
  .object({ revision: revisionField, name: name(60).optional(), active: z.boolean().optional(), order: surfaceOrder.optional(), reason: optionalReasonField })
  .strict();

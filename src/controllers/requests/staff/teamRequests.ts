import { z } from 'zod';

/** A query-string whole number within bounds, with a default; digits only. */
const wholeNumber = (defaultValue: number, min: number, max: number) =>
  z
    .string({ invalid_type_error: 'Must be a whole number.' })
    .regex(/^\d+$/, 'Must be a whole number.')
    .default(String(defaultValue))
    .transform(Number)
    .pipe(z.number().int().min(min, `Must be at least ${min}.`).max(max, `Must be at most ${max}.`));

/** `GET /admin/staff` (contracts/team-api.md). */
export const listStaffQuerySchema = z.object({
  status: z.enum(['invited', 'active', 'disabled']).optional(),
  roleId: z.string().min(1).max(40).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  page: wholeNumber(1, 1, 100000),
  pageSize: wholeNumber(20, 1, 50),
});

/** `GET /admin/roles`. */
export const listRolesQuerySchema = z.object({
  page: wholeNumber(1, 1, 100000),
  pageSize: wholeNumber(20, 1, 50),
});

/** The shape of a role; the domain checks its rules (lengths, catalog, uniqueness). */
const roleFields = {
  name: z.string({ required_error: 'name is required', invalid_type_error: 'name must be a string' }),
  description: z.string({ invalid_type_error: 'description must be a string' }).max(300, 'Must be at most 300 characters.').default(''),
  permissions: z.array(z.string(), { required_error: 'permissions is required', invalid_type_error: 'permissions must be a list' }),
};

/** `POST /admin/roles`. */
export const createRoleRequestSchema = z.object({ id: z.string().optional(), ...roleFields }).strict();

/** `PUT /admin/roles/:roleId`. */
export const updateRoleRequestSchema = z.object(roleFields).strict();

/** The reason of an action that removes or changes access (spec 002, FR-023a). */
export const reasonRequestSchema = z.object({
  reason: z
    .string({ required_error: 'reason is required', invalid_type_error: 'reason must be a string' })
    .trim()
    .min(3, 'Must be 3–300 characters.')
    .max(300, 'Must be 3–300 characters.'),
});

/** `POST /admin/staff`: the domain normalizes and validates the email. */
export const inviteRequestSchema = z
  .object({
    email: z.string({ required_error: 'email is required', invalid_type_error: 'email must be a string' }).max(254),
    roleId: z.string({ required_error: 'roleId is required', invalid_type_error: 'roleId must be a string' }).min(1),
  })
  .strict();

/** `PATCH /admin/staff/:staffId`. */
export const changeRoleRequestSchema = reasonRequestSchema
  .extend({ roleId: z.string({ required_error: 'roleId is required', invalid_type_error: 'roleId must be a string' }).min(1) })
  .strict();

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Must be an ISO 8601 date.')
  .transform((value) => new Date(value));

/** `GET /admin/audit-log` (contracts/team-api.md). */
export const listAuditLogQuerySchema = z.object({
  staffId: z.string().min(1).max(64).optional(),
  resourceType: z.string().min(1).max(64).optional(),
  action: z.string().min(1).max(100).optional(),
  outcome: z.enum(['done', 'replayed', 'rejected', 'denied']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  cursor: z.string().min(1).max(500).optional(),
  limit: wholeNumber(50, 1, 100),
});

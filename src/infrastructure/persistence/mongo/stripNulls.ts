/**
 * Omits every `null`/`undefined`-valued key entirely, rather than storing it as BSON
 * null. Mirrors the source system's `IgnoreIfNullConvention` — required so a sparse
 * unique index (e.g. on `normalizedPhoneNumber`) truly excludes incomplete profiles
 * instead of treating every explicit `null` as a colliding value.
 */
export function stripNulls<T extends Record<string, unknown>>(doc: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (value !== null && value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

/**
 * A short fingerprint of the values an administrator may correct, sent back with the next write
 * so two corrections never overwrite each other silently (admin spec 005, research §9). A
 * `revision` field would not work on `users`: the app saves a user with `replaceOne`, which drops
 * any field the entity does not know.
 */
export function contactVersion(fields: {
  firstName?: string | null;
  lastName?: string | null;
  countryCallingCode?: string | null;
  normalizedPhoneNumber?: string | null;
}): string {
  return fingerprint([fields.firstName, fields.lastName, fields.countryCallingCode, fields.normalizedPhoneNumber]);
}

/** The same fingerprint for a goalkeeper's identity document. */
export function documentVersion(fields: { documentType?: string | null; documentNumber?: string | null }): string {
  return fingerprint([fields.documentType, fields.documentNumber]);
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

/**
 * FNV-1a, 64 bits: a change detector, not a security measure, so it needs no `node:crypto` (which
 * the layering rule keeps out of the domain). JSON keeps the fields apart: `['ab', 'c']` and
 * `['a', 'bc']` never collide.
 */
function fingerprint(values: (string | null | undefined)[]): string {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(JSON.stringify(values.map((value) => value ?? null)))) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

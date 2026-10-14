const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trimmed and lower-cased, or `null` when it is not an email address. The one rule for team
 * members (spec 001) and for the accounts a sign-in code finds (admin spec 009, `users.emailKey`).
 */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

/** `j***@gmail.com`: what the security log keeps of an address (admin spec 009, FR-020). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

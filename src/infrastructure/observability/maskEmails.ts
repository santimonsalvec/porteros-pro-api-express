const EMAIL = /([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/**
 * A copy of `value` where every email, at any depth, keeps only its first character and its domain
 * (`ana@example.com` → `a***@example.com`). For what goes to the logs, which never take a full email.
 */
export function maskEmails<T>(value: T): T {
  if (typeof value === 'string') return value.replace(EMAIL, '$1***@$2') as T;
  if (Array.isArray(value)) return value.map(maskEmails) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, maskEmails(item)])) as T;
  }
  return value;
}

/**
 * Evaluates the small subset of a Mongo `$match` the admin search builds (`$and`, `$or` and
 * `$regex`), so the in-memory readers filter exactly like the Mongo ones.
 */
export function matchesDocument(match: Record<string, unknown>, document: Record<string, unknown>): boolean {
  return Object.entries(match).every(([key, condition]) => {
    if (key === '$and') return (condition as Record<string, unknown>[]).every((part) => matchesDocument(part, document));
    if (key === '$or') return (condition as Record<string, unknown>[]).some((part) => matchesDocument(part, document));
    const value = document[key];
    const { $regex, $options } = condition as { $regex: string; $options?: string };
    return typeof value === 'string' && new RegExp($regex, $options ?? '').test(value);
  });
}

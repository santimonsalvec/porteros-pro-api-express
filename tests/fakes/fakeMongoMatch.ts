/**
 * Evaluates the small subset of a Mongo `$match` the admin readers build (`$and`, `$or`, `$regex`
 * and, since admin spec 006, `$gt` / `$eq` on numbers), so the in-memory readers filter exactly
 * like the Mongo ones.
 */
export function matchesDocument(match: Record<string, unknown>, document: Record<string, unknown>): boolean {
  return Object.entries(match).every(([key, condition]) => {
    if (key === '$and') return (condition as Record<string, unknown>[]).every((part) => matchesDocument(part, document));
    if (key === '$or') return (condition as Record<string, unknown>[]).some((part) => matchesDocument(part, document));
    const value = document[key];
    const operators = condition as { $regex?: string; $options?: string; $gt?: number; $eq?: number };
    if (operators.$gt !== undefined) return typeof value === 'number' && value > operators.$gt;
    if (operators.$eq !== undefined) return typeof value === 'number' && value === operators.$eq;
    return typeof value === 'string' && new RegExp(operators.$regex!, operators.$options ?? '').test(value);
  });
}

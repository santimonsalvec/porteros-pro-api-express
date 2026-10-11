import type { Collection, Document } from 'mongodb';
import type { UpdateResult } from '../../../application/features/geography/common/ports.js';
import { idFilter } from './idFilter.js';

/**
 * Writes `fields` only if the document is still at `revision`, and bumps it (admin spec 003,
 * research §5). A seeded document without a revision counts as revision 0.
 */
export async function updateAtRevision(
  collection: Collection<Document>,
  id: string,
  revision: number,
  fields: Document,
): Promise<UpdateResult> {
  const atRevision = revision === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision };
  const result = await collection.updateOne({ ...idFilter(id), ...atRevision }, { $set: fields, $inc: { revision: 1 } });
  return result.matchedCount > 0 ? 'saved' : 'stale';
}

/** How many documents share each of `keys` in `field`; keys without documents count 0. */
export async function countBy(collection: Collection<Document>, field: string, keys: string[]): Promise<Map<string, number>> {
  const counts = new Map(keys.map((key) => [key, 0]));
  if (keys.length === 0) return counts;
  const rows = await collection
    .aggregate<{ _id: string; count: number }>([{ $match: { [field]: { $in: keys } } }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }])
    .toArray();
  for (const row of rows) counts.set(String(row._id), row.count);
  return counts;
}

export async function deleteById(collection: Collection<Document>, id: string): Promise<boolean> {
  const result = await collection.deleteOne(idFilter(id));
  return result.deletedCount > 0;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A case-insensitive "starts with" on `field`, which a `{ field: 1 }` index can serve. */
export function prefixFilter(field: string, q: string): Document {
  return { [field]: { $regex: `^${escapeRegExp(q)}`, $options: 'i' } };
}

/** `{ $and: [...] }` of the given clauses, or `{}` when there are none. */
export function allOf(clauses: Document[]): Document {
  return clauses.length === 0 ? {} : { $and: clauses };
}

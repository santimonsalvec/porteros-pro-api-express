import type { Collection, Document } from 'mongodb';
import type { PricedModality } from '../../../domain/bookings/matchFormat.js';
import type { CreateResult, PriceFilter, PriceRecord } from '../../../application/features/pricing/common/ports.js';
import { idFilter } from './idFilter.js';

const DUPLICATE_KEY = 11000;

/**
 * What the rate and commission collections share in the admin web (spec 004 of the admin): the
 * filter by refs and modality, the record shown even when the domain refuses it, and a create
 * that turns the unique index of feature 024 into a `duplicate` answer.
 */

/** The Mongo filter of an admin price list; `null` when it can match nothing (an empty ref list). */
export function priceFilter(filter: PriceFilter, extra: Document = {}): Document | null {
  const query: Document = {};
  if (filter.refs !== null) {
    const or = filter.refs.filter((ref) => ref.refIds.length > 0).map((ref) => ({ scope: ref.scope, refId: { $in: ref.refIds } }));
    if (or.length === 0) return null;
    query.$or = or;
  }
  Object.assign(query, extra);
  if (filter.modality !== undefined) query.modality = filter.modality === 'general' ? null : filter.modality;
  return query;
}

/** The stored fields as they are, plus whether the domain accepts them. */
export function priceRecordOf<Scope extends string>(doc: Document, accepts: (doc: Document) => void): PriceRecord<Scope> {
  let invalid = false;
  try {
    accepts(doc);
  } catch {
    invalid = true;
  }
  return {
    id: String(doc._id),
    scope: doc.scope as Scope,
    refId: String(doc.refId),
    modality: (doc.modality as PricedModality | undefined) ?? null,
    amount: doc.amount as number,
    revision: typeof doc.revision === 'number' ? doc.revision : 0,
    invalid,
  };
}

/** Inserts with explicit `null` tiers; on the unique index, finds which document already holds that identity. */
export async function createPrice(collection: Collection<Document>, id: string, identity: Document, fields: Document): Promise<CreateResult> {
  try {
    await collection.insertOne({ _id: id, ...identity, ...fields, revision: 0 } as Document);
    return { outcome: 'created' };
  } catch (error) {
    if ((error as { code?: unknown }).code !== DUPLICATE_KEY) throw error;
    const existing = await collection.findOne(identity, { projection: { _id: 1 } });
    return { outcome: 'duplicate', existingId: existing ? String(existing._id) : null };
  }
}

export async function findPriceById(collection: Collection<Document>, id: string): Promise<Document | null> {
  return collection.findOne(idFilter(id));
}

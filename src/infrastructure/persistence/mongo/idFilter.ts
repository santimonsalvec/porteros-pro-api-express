import { ObjectId, type Document } from 'mongodb';

const OBJECT_ID_SHAPE = /^[0-9a-f]{24}$/i;

/**
 * The filter for one reference document by its id as the API shows it (`String(_id)`).
 * Seeded documents may keep an `ObjectId`; new ones use text ids (admin spec 003, research §6).
 */
export function idFilter(id: string): Document {
  return OBJECT_ID_SHAPE.test(id) ? { _id: { $in: [id, new ObjectId(id)] } } : { _id: id };
}

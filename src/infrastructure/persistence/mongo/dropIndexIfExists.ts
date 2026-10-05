import type { Collection, Document } from 'mongodb';

/** MongoDB's "index not found" error code. */
const INDEX_NOT_FOUND = 27;

/** Drops an index an older version created; a missing index is not an error. */
export async function dropIndexIfExists(collection: Collection<Document>, name: string): Promise<void> {
  try {
    await collection.dropIndex(name);
  } catch (error) {
    if ((error as { code?: unknown }).code !== INDEX_NOT_FOUND) throw error;
  }
}

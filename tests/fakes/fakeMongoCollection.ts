import { vi, type Mock } from 'vitest';

/**
 * A `vi.fn()`-based stand-in for a MongoDB `Collection<Document>` — every test
 * mocks the method it needs and asserts on call arguments / substitutes a canned
 * response. No real or in-memory database engine is involved (per product
 * direction: repository tests must never depend on a real resource, mocked
 * responses only — see spec.md Clarifications session 2026-08-29, second entry).
 */
export interface FakeMongoCollection {
  find: Mock;
  findOne: Mock;
  insertOne: Mock;
  replaceOne: Mock;
  deleteOne: Mock;
  updateOne: Mock;
  createIndex: Mock;
}

export function createFakeCollection(): FakeMongoCollection {
  return {
    find: vi.fn(),
    findOne: vi.fn(),
    insertOne: vi.fn(),
    replaceOne: vi.fn(),
    deleteOne: vi.fn(),
    updateOne: vi.fn(),
    createIndex: vi.fn(),
  };
}

/** Helper for mocking `.find(...)`, which returns a cursor-like object with `.toArray()`. */
export function toArrayResult(docs: unknown[]) {
  return { toArray: vi.fn().mockResolvedValue(docs) };
}

import { describe, expect, it, vi } from 'vitest';
import type { ClientSession, Collection, Db, Document } from 'mongodb';
import { MongoGoalkeeperDocumentWriter } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperDocumentWriter.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

const OLD = { documentType: 'CC', documentNumber: '1020304050' };
const NEW = { documentType: 'CC', documentNumber: '1020304051' };

function harness() {
  const goalkeeperProfiles = createFakeCollection();
  const goalkeeperRegistrations = createFakeCollection();
  const collections: Record<string, unknown> = { goalkeeperProfiles, goalkeeperRegistrations };
  const db = { collection: (name: string) => collections[name] as Collection<Document> } as unknown as Db;
  const session = {
    withTransaction: vi.fn(async (fn: (s: ClientSession) => Promise<unknown>, _options?: unknown) => fn(session as unknown as ClientSession)),
    endSession: vi.fn(async () => undefined),
  };
  return { goalkeeperProfiles, goalkeeperRegistrations, session, writer: new MongoGoalkeeperDocumentWriter(() => session as unknown as ClientSession, db) };
}

describe('MongoGoalkeeperDocumentWriter (mocked driver, admin spec 005, research §11)', () => {
  it('writes the registration, then the profile only if it still has the values read, in one transaction', async () => {
    const h = harness();
    h.goalkeeperRegistrations.updateOne.mockResolvedValue({ matchedCount: 1 });
    h.goalkeeperProfiles.updateOne.mockResolvedValue({ matchedCount: 1 });

    expect(await h.writer.correct('u1', OLD, NEW)).toBe('saved');

    expect(h.goalkeeperRegistrations.updateOne).toHaveBeenCalledWith(
      { userId: 'u1' },
      { $set: { 'identification.documentType': 'CC', 'identification.documentNumber': '1020304051', updatedAt: expect.any(Date) } },
      { session: h.session },
    );
    expect(h.goalkeeperProfiles.updateOne).toHaveBeenCalledWith({ userId: 'u1', ...OLD }, { $set: NEW }, { session: h.session });
    expect(h.session.endSession).toHaveBeenCalled();
  });

  it('answers stale (and the transaction aborts) when the profile changed since it was read', async () => {
    const h = harness();
    h.goalkeeperRegistrations.updateOne.mockResolvedValue({ matchedCount: 1 });
    h.goalkeeperProfiles.updateOne.mockResolvedValue({ matchedCount: 0 });

    expect(await h.writer.correct('u1', OLD, NEW)).toBe('stale');
    expect(h.session.endSession).toHaveBeenCalled();
  });

  it('answers duplicate when the unique index refuses the registration', async () => {
    const h = harness();
    h.goalkeeperRegistrations.updateOne.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));

    expect(await h.writer.correct('u1', OLD, NEW)).toBe('duplicate');
    expect(h.goalkeeperProfiles.updateOne).not.toHaveBeenCalled();
  });
});

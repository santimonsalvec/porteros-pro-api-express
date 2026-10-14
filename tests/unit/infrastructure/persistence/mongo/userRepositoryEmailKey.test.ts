import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { EmailKeyTakenError } from '../../../../../src/application/features/auth/common/ports.js';
import { UserRepository } from '../../../../../src/infrastructure/persistence/mongo/userRepository.js';
import { User } from '../../../../../src/domain/users/user.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new UserRepository(db);
}

const duplicateKey = (index: string) => Object.assign(new Error(`E11000 duplicate key error index: ${index}`), { code: 11000, keyPattern: { [index === 'emailKey_unique' ? 'emailKey' : 'x']: 1 } });

describe('UserRepository: one account per proven email (admin spec 009)', () => {
  it('stores the email key of an account a code created, and no identities', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({ acknowledged: true });

    await repositoryWith(collection).add(User.createFromVerifiedEmail({ id: 'user-1', email: 'Juana@Gmail.com' }));

    const doc = collection.insertOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(doc.emailKey).toBe('juana@gmail.com');
    expect(doc.externalIdentities).toEqual([]);
  });

  it('writes no email key for an account without a proven address', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({ acknowledged: true });
    const user = User.createFromExternalIdentity({ id: 'user-1', email: 'a@example.com', displayName: null, provider: 'google', subject: 'sub-1' });

    await repositoryWith(collection).add(user);

    expect(Object.prototype.hasOwnProperty.call(collection.insertOne.mock.calls[0]![0], 'emailKey')).toBe(false);
  });

  it('reads the email key back, null when absent', async () => {
    const collection = createFakeCollection();
    const base = { _id: 'user-1', email: 'juana@gmail.com', isAdmin: false, externalIdentities: [], createdAt: new Date(), isProfileComplete: false };
    collection.findOne.mockResolvedValueOnce({ ...base, emailKey: 'juana@gmail.com' }).mockResolvedValueOnce(base);
    const repository = repositoryWith(collection);

    expect((await repository.getById('user-1'))?.emailKey).toBe('juana@gmail.com');
    expect((await repository.getById('user-1'))?.emailKey).toBeNull();
  });

  it('finds an account by its email key', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);

    expect(await repositoryWith(collection).findByEmailKey('juana@gmail.com')).toBeNull();
    expect(collection.findOne).toHaveBeenCalledWith({ emailKey: 'juana@gmail.com' });
  });

  it('reports a second account for the same proven email as EmailKeyTakenError', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockRejectedValue(duplicateKey('emailKey_unique'));

    await expect(repositoryWith(collection).add(User.createFromVerifiedEmail({ id: 'user-2', email: 'juana@gmail.com' }))).rejects.toBeInstanceOf(
      EmailKeyTakenError,
    );
  });

  it('lets any other duplicate key through as it was', async () => {
    const collection = createFakeCollection();
    const error = duplicateKey('normalizedPhoneNumber_unique_sparse');
    collection.insertOne.mockRejectedValue(error);

    await expect(repositoryWith(collection).add(User.createFromVerifiedEmail({ id: 'user-2', email: 'juana@gmail.com' }))).rejects.toBe(error);
  });

  it('indexes the email key as unique only where it exists', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');

    await repositoryWith(collection).ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith(
      { emailKey: 1 },
      { unique: true, name: 'emailKey_unique', partialFilterExpression: { emailKey: { $type: 'string' } } },
    );
  });

  it('keeps external identities unique only for accounts that have one, so code accounts do not collide', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');
    collection.dropIndex.mockResolvedValue(undefined);

    await repositoryWith(collection).ensureIndexes();

    expect(collection.dropIndex).toHaveBeenCalledWith('externalIdentities_provider_subject_unique');
    expect(collection.createIndex).toHaveBeenCalledWith(
      { 'externalIdentities.provider': 1, 'externalIdentities.subject': 1 },
      {
        unique: true,
        name: 'externalIdentities_provider_subject_unique_partial',
        partialFilterExpression: { 'externalIdentities.subject': { $type: 'string' } },
      },
    );
  });
});

import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { UserRepository } from '../../../../../src/infrastructure/persistence/mongo/userRepository.js';
import { User } from '../../../../../src/domain/users/user.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new UserRepository(db);
}

describe('UserRepository (mocked driver)', () => {
  it('maps a User to a document with null fields stripped', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({ acknowledged: true, insertedId: 'user-1' });
    const repository = repositoryWith(collection);
    const user = User.createFromExternalIdentity({ id: 'user-1', email: 'a@example.com', displayName: null, provider: 'google', subject: 'sub-1' });

    await repository.add(user);

    const doc = collection.insertOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(doc._id).toBe('user-1');
    expect(doc.firstName).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(doc, 'firstName')).toBe(false);
    expect(doc.externalIdentities).toEqual([{ provider: 'google', subject: 'sub-1', email: 'a@example.com' }]);
  });

  it('maps a raw document back to a User, defaulting absent fields to null', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({
      _id: 'user-1',
      email: 'a@example.com',
      isAdmin: false,
      externalIdentities: [{ provider: 'google', subject: 'sub-1', email: 'a@example.com' }],
      createdAt: new Date('2024-01-15T09:30:00Z'),
      isProfileComplete: false,
    });
    const repository = repositoryWith(collection);

    const user = await repository.getById('user-1');

    expect(user?.firstName).toBeNull();
    expect(user?.normalizedPhoneNumber).toBeNull();
    expect(user?.isProfileComplete).toBe(false);
  });

  it('findByExternalIdentity queries by provider and subject', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);
    const repository = repositoryWith(collection);

    await repository.findByExternalIdentity('google', 'sub-1');

    expect(collection.findOne).toHaveBeenCalledWith({
      'externalIdentities.provider': 'google',
      'externalIdentities.subject': 'sub-1',
    });
  });

  it('existsByPhoneNumber queries by the normalized number, excluding self when given', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);
    const repository = repositoryWith(collection);

    await repository.existsByPhoneNumber('+57', '300 123 4567');
    await repository.existsByPhoneNumber('+57', '300 123 4567', 'user-1');

    expect(collection.findOne).toHaveBeenNthCalledWith(1, { normalizedPhoneNumber: '573001234567' });
    expect(collection.findOne).toHaveBeenNthCalledWith(2, {
      normalizedPhoneNumber: '573001234567',
      _id: { $ne: 'user-1' },
    });
  });

  it('ensureIndexes creates the compound external-identity and sparse phone-number indexes', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');
    const repository = repositoryWith(collection);

    await repository.ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith(
      { 'externalIdentities.provider': 1, 'externalIdentities.subject': 1 },
      expect.objectContaining({ unique: true }),
    );
    expect(collection.createIndex).toHaveBeenCalledWith(
      { normalizedPhoneNumber: 1 },
      expect.objectContaining({ unique: true, sparse: true }),
    );
  });
});

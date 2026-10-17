import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { UserRepository } from '../../../../../src/infrastructure/persistence/mongo/userRepository.js';
import { User } from '../../../../../src/domain/users/user.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

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


  it('ensureIndexes also orders the admin user list (admin spec 005)', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');

    await repositoryWith(collection).ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ createdAt: -1, _id: -1 }, { name: 'createdAt_id' });
  });

  it('reads several users by id with one query, and none for an empty list', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([
      { _id: 'user-1', email: 'a@example.com', isAdmin: false, externalIdentities: [], createdAt: new Date(), isProfileComplete: true, firstName: 'Ana' },
    ]));

    const users = await repositoryWith(collection).getByIds(['user-1', 'user-x']);

    expect(collection.find).toHaveBeenCalledWith({ _id: { $in: ['user-1', 'user-x'] } });
    expect(users.map((user) => user.firstName)).toEqual(['Ana']);
    expect(await repositoryWith(createFakeCollection()).getByIds([])).toEqual([]);
  });

  describe('updateContactIfUnchanged (admin spec 005, research §9)', () => {
    const expected = { firstName: 'Ana', lastName: 'Portera', countryCallingCode: '+57', normalizedPhoneNumber: '573000000001' };
    const next = { firstName: 'Ana', lastName: 'Gómez', countryCallingCode: '+57', whatsAppNumber: '3001112222', normalizedPhoneNumber: '573001112222' };

    it('writes only if the user still has the values read', async () => {
      const collection = createFakeCollection();
      collection.updateOne.mockResolvedValue({ matchedCount: 1 });

      expect(await repositoryWith(collection).updateContactIfUnchanged('u1', expected, next)).toBe('saved');
      expect(collection.updateOne).toHaveBeenCalledWith({ _id: 'u1', ...expected }, { $set: next });
    });

    it('answers stale when nothing matched, and duplicate when the phone index refuses it', async () => {
      const collection = createFakeCollection();
      collection.updateOne.mockResolvedValueOnce({ matchedCount: 0 });
      collection.updateOne.mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }));
      const repository = repositoryWith(collection);

      expect(await repository.updateContactIfUnchanged('u1', expected, next)).toBe('stale');
      expect(await repository.updateContactIfUnchanged('u1', expected, next)).toBe('duplicate');
    });
  });
});

describe('UserRepository preferredLanguage (feature 032)', () => {
  it('stores the chosen language and drops the field when there is none', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({ acknowledged: true, insertedId: 'user-1' });
    const repository = repositoryWith(collection);
    const chosen = new User({ ...bare('user-1'), preferredLanguage: 'en' });
    const undecided = new User(bare('user-2'));

    await repository.add(chosen);
    await repository.add(undecided);

    const [first, second] = collection.insertOne.mock.calls.map((call) => call[0] as Record<string, unknown>);
    expect(first!.preferredLanguage).toBe('en');
    expect(Object.prototype.hasOwnProperty.call(second, 'preferredLanguage')).toBe(false);
  });

  it('reads an old document without the field as null, and ignores an unsupported value', async () => {
    const collection = createFakeCollection();
    collection.findOne
      .mockResolvedValueOnce({ _id: 'user-1', email: 'a@example.com', isAdmin: false, externalIdentities: [], createdAt: new Date(), isProfileComplete: false })
      .mockResolvedValueOnce({ _id: 'user-2', email: 'b@example.com', isAdmin: false, externalIdentities: [], createdAt: new Date(), isProfileComplete: false, preferredLanguage: 'en' })
      .mockResolvedValueOnce({ _id: 'user-3', email: 'c@example.com', isAdmin: false, externalIdentities: [], createdAt: new Date(), isProfileComplete: false, preferredLanguage: 'fr' });
    const repository = repositoryWith(collection);

    expect((await repository.getById('user-1'))?.preferredLanguage).toBeNull();
    expect((await repository.getById('user-2'))?.preferredLanguage).toBe('en');
    expect((await repository.getById('user-3'))?.preferredLanguage).toBeNull();
  });
});

function bare(id: string) {
  return {
    id,
    email: `${id}@example.com`,
    displayName: null,
    isAdmin: false,
    externalIdentities: [],
    createdAt: new Date('2024-01-15T09:30:00Z'),
    firstName: null,
    lastName: null,
    countryCallingCode: null,
    whatsAppNumber: null,
    isProfileComplete: false,
    normalizedPhoneNumber: null,
  };
}

import { describe, expect, it, vi } from 'vitest';
import type { ClientSession, Collection, Db, Document } from 'mongodb';
import { MongoStaffMemberRepository } from '../../../../../src/infrastructure/persistence/mongo/staffMemberRepository.js';
import { MongoStaffRoleRepository } from '../../../../../src/infrastructure/persistence/mongo/staffRoleRepository.js';
import { MongoAdminSessionStore } from '../../../../../src/infrastructure/persistence/mongo/adminSessionStore.js';
import { StaffMember } from '../../../../../src/domain/staff/staffMember.js';
import { StaffRole } from '../../../../../src/domain/staff/staffRole.js';
import { AdminSession } from '../../../../../src/domain/staff/adminSession.js';
import { createFakeCollection, toArrayCursor, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

const NOW = new Date('2026-10-08T14:00:00.000Z');
const dbWith = (collection: ReturnType<typeof createFakeCollection>) =>
  ({ collection: () => collection as unknown as Collection<Document> }) as unknown as Db;
const fakeSession = () => {
  const session = {
    withTransaction: vi.fn(async (fn: (s: ClientSession) => Promise<unknown>) => fn(session as unknown as ClientSession)),
    endSession: vi.fn(async () => undefined),
  };
  return session;
};
const member = () => StaffMember.invite({ id: 'staff-1', email: 'ana@example.com', roleId: 'owner', invitedBy: 'system:script' }, NOW);
const session = () =>
  AdminSession.start({ id: 'sid-1', staffId: 'staff-1', userId: 'user-1', refreshTokenHash: 'h1', userAgent: 'ua', ip: '1.2.3.4' }, NOW);

describe('MongoStaffMemberRepository', () => {
  it('maps a member to its document and back', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({});
    const repository = new MongoStaffMemberRepository(dbWith(collection), () => fakeSession() as unknown as ClientSession);

    await repository.add(member());
    const doc = collection.insertOne.mock.calls[0]![0] as Document;
    collection.findOne.mockResolvedValue(doc);
    const back = await repository.findByEmail('ana@example.com');

    expect(doc).toMatchObject({ _id: 'staff-1', email: 'ana@example.com', userId: null, roleIds: ['owner'], status: 'invited', inviteExpiresAt: expect.any(Date) });
    expect(collection.findOne).toHaveBeenCalledWith({ email: 'ana@example.com' });
    expect(back).toEqual(member());
  });

  it('reads by id and replaces on update', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);
    collection.replaceOne.mockResolvedValue({});
    const repository = new MongoStaffMemberRepository(dbWith(collection), () => fakeSession() as unknown as ClientSession);

    expect(await repository.getById('staff-1')).toBeNull();
    await repository.update(member());

    expect(collection.findOne).toHaveBeenCalledWith({ _id: 'staff-1' });
    expect(collection.replaceOne).toHaveBeenCalledWith({ _id: 'staff-1' }, expect.objectContaining({ email: 'ana@example.com' }));
  });

  it('finds by linked account', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);
    const repository = new MongoStaffMemberRepository(dbWith(collection), () => fakeSession() as unknown as ClientSession);

    expect(await repository.findByUserId('user-1')).toBeNull();
    expect(collection.findOne).toHaveBeenCalledWith({ userId: 'user-1' });
  });

  it('creates the email, account and role-status indexes', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');

    await new MongoStaffMemberRepository(dbWith(collection), () => fakeSession() as unknown as ClientSession).ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ email: 1 }, { name: 'email_unique', unique: true });
    expect(collection.createIndex).toHaveBeenCalledWith(
      { userId: 1 },
      { name: 'userId_unique', unique: true, partialFilterExpression: { userId: { $type: 'string' } } },
    );
    expect(collection.createIndex).toHaveBeenCalledWith({ roleIds: 1, status: 1 }, { name: 'role_status' });
  });

  it('saves a guarded change in a transaction', async () => {
    const collection = createFakeCollection();
    collection.countDocuments.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    collection.replaceOne.mockResolvedValue({});
    const tx = fakeSession();
    const repository = new MongoStaffMemberRepository(dbWith(collection), () => tx as unknown as ClientSession);

    expect(await repository.saveGuardingOwners(member().disable(NOW))).toBe('saved');
    expect(tx.withTransaction).toHaveBeenCalledOnce();
    expect(collection.countDocuments).toHaveBeenCalledWith({ roleIds: 'owner', status: 'active' }, { session: tx });
    expect(tx.endSession).toHaveBeenCalled();
  });

  it('refuses, writing nothing, a change that leaves no active owner', async () => {
    const collection = createFakeCollection();
    collection.countDocuments.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    collection.replaceOne.mockResolvedValue({});
    const tx = fakeSession();
    const repository = new MongoStaffMemberRepository(dbWith(collection), () => tx as unknown as ClientSession);

    expect(await repository.saveGuardingOwners(member().disable(NOW))).toBe('last_owner');
    expect(tx.endSession).toHaveBeenCalled();
  });
});

describe('MongoStaffMemberRepository — listing (spec 002)', () => {
  it('filters by status, role and an escaped case-insensitive prefix, by email, one page at a time', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([]);
    collection.find.mockReturnValue(cursor);
    collection.countDocuments.mockResolvedValue(41);
    const repository = new MongoStaffMemberRepository(dbWith(collection), () => fakeSession() as unknown as ClientSession);

    const result = await repository.list({ status: 'active', roleId: 'soporte', q: 'Ana.P', page: 3, pageSize: 20 });

    const filter = { status: 'active', roleIds: 'soporte', $or: [{ email: { $regex: '^Ana\\.P', $options: 'i' } }, { displayName: { $regex: '^Ana\\.P', $options: 'i' } }] };
    expect(collection.find).toHaveBeenCalledWith(filter);
    expect(cursor.sort).toHaveBeenCalledWith({ email: 1 });
    expect(cursor.skip).toHaveBeenCalledWith(40);
    expect(cursor.limit).toHaveBeenCalledWith(20);
    expect(collection.countDocuments).toHaveBeenCalledWith(filter);
    expect(result).toEqual({ items: [], totalItems: 41 });
  });

  it('lists the whole team when no filter is given', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayCursor([]));
    collection.countDocuments.mockResolvedValue(0);
    const repository = new MongoStaffMemberRepository(dbWith(collection), () => fakeSession() as unknown as ClientSession);

    await repository.list({ page: 1, pageSize: 20 });

    expect(collection.find).toHaveBeenCalledWith({});
  });

  it('counts members per role', async () => {
    const collection = createFakeCollection();
    collection.aggregate.mockReturnValue(toArrayResult([{ _id: 'soporte', count: 2 }]));
    const repository = new MongoStaffMemberRepository(dbWith(collection), () => fakeSession() as unknown as ClientSession);

    const counts = await repository.countByRole(['soporte', 'owner']);

    expect(collection.aggregate).toHaveBeenCalledWith([
      { $match: { roleIds: { $in: ['soporte', 'owner'] } } },
      { $unwind: '$roleIds' },
      { $match: { roleIds: { $in: ['soporte', 'owner'] } } },
      { $group: { _id: '$roleIds', count: { $sum: 1 } } },
    ]);
    expect(counts).toEqual(new Map([['soporte', 2]]));
  });
});

describe('MongoStaffRoleRepository', () => {
  it('upserts a role and maps it back', async () => {
    const collection = createFakeCollection();
    collection.replaceOne.mockResolvedValue({});
    const repository = new MongoStaffRoleRepository(dbWith(collection), () => fakeSession() as unknown as ClientSession);
    const role = StaffRole.create({ id: 'soporte', name: 'Soporte', description: '', permissions: ['cases.read'] }, NOW);

    await repository.upsert(role);
    const [filter, doc, options] = collection.replaceOne.mock.calls[0]!;
    collection.findOne.mockResolvedValue(doc);

    expect(filter).toEqual({ _id: 'soporte' });
    expect(doc).toMatchObject({ name: 'Soporte', nameKey: 'soporte', permissions: ['cases.read'], system: false });
    expect(options).toEqual({ upsert: true });
    expect(await repository.getById('soporte')).toEqual(role);
  });

  it('ensureOwner inserts the owner only when missing', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({});
    collection.findOne.mockResolvedValue({ _id: 'owner', name: 'Dueño', nameKey: 'dueño', description: '', permissions: [], system: true, createdAt: NOW, updatedAt: NOW });
    const repository = new MongoStaffRoleRepository(dbWith(collection), () => fakeSession() as unknown as ClientSession);

    const owner = await repository.ensureOwner(NOW);

    expect(collection.updateOne).toHaveBeenCalledWith({ _id: 'owner' }, { $setOnInsert: expect.objectContaining({ system: true, permissions: [] }) }, { upsert: true });
    expect(owner.isOwner).toBe(true);
  });

  it('lists the owner first, then by name', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([]);
    collection.find.mockReturnValue(cursor);
    collection.countDocuments.mockResolvedValue(3);

    const result = await new MongoStaffRoleRepository(dbWith(collection), () => fakeSession() as unknown as ClientSession).list(1, 20);

    expect(cursor.sort).toHaveBeenCalledWith({ system: -1, nameKey: 1 });
    expect(cursor.skip).toHaveBeenCalledWith(0);
    expect(result.totalItems).toBe(3);
  });

  it('reports a repeated name on create and save', async () => {
    const collection = createFakeCollection();
    const duplicate = Object.assign(new Error('dup'), { code: 11000, keyPattern: { nameKey: 1 } });
    collection.insertOne.mockRejectedValueOnce(duplicate).mockResolvedValueOnce({});
    collection.replaceOne.mockRejectedValueOnce(duplicate).mockResolvedValueOnce({});
    const repository = new MongoStaffRoleRepository(dbWith(collection), () => fakeSession() as unknown as ClientSession);
    const role = StaffRole.create({ id: 'soporte', name: 'Soporte', description: '', permissions: [] }, NOW);

    expect(await repository.create(role)).toBe('name_taken');
    expect(await repository.create(role)).toBe('created');
    expect(await repository.save(role)).toBe('name_taken');
    expect(await repository.save(role)).toBe('saved');
  });

  it('deletes a role only while nobody has it, in a transaction', async () => {
    const roles = createFakeCollection();
    const members = createFakeCollection();
    const db = { collection: (name: string) => (name === 'staffRoles' ? roles : members) as unknown as Collection<Document> } as unknown as Db;
    const tx = fakeSession();
    const repository = new MongoStaffRoleRepository(db, () => tx as unknown as ClientSession);

    roles.findOne.mockResolvedValueOnce(null);
    expect(await repository.deleteIfUnused('nope')).toBe('not_found');

    roles.findOne.mockResolvedValue({ _id: 'soporte' });
    members.countDocuments.mockResolvedValueOnce(2);
    expect(await repository.deleteIfUnused('soporte')).toBe('in_use');
    expect(roles.deleteOne).not.toHaveBeenCalled();

    members.countDocuments.mockResolvedValueOnce(0);
    roles.deleteOne.mockResolvedValue({});
    expect(await repository.deleteIfUnused('soporte')).toBe('deleted');
    expect(members.countDocuments).toHaveBeenCalledWith({ roleIds: 'soporte' }, { session: tx });
    expect(roles.deleteOne).toHaveBeenCalledWith({ _id: 'soporte' }, { session: tx });
    expect(tx.endSession).toHaveBeenCalled();
  });

  it('reads an old role document without description or permissions as empty', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 'viejo', name: 'Viejo', createdAt: NOW, updatedAt: NOW });
    const repository = new MongoStaffRoleRepository(dbWith(collection), () => fakeSession() as unknown as ClientSession);

    expect(await repository.getById('viejo')).toMatchObject({ id: 'viejo', description: '', permissions: [], system: false });
  });

  it('lets other database errors through on create, save and delete', async () => {
    const roles = createFakeCollection();
    const members = createFakeCollection();
    const db = { collection: (name: string) => (name === 'staffRoles' ? roles : members) as unknown as Collection<Document> } as unknown as Db;
    const tx = fakeSession();
    const repository = new MongoStaffRoleRepository(db, () => tx as unknown as ClientSession);
    const down = new Error('network');
    const otherDuplicate = Object.assign(new Error('dup'), { code: 11000, keyPattern: { _id: 1 } });
    roles.insertOne.mockRejectedValueOnce(down).mockRejectedValueOnce(otherDuplicate);
    roles.replaceOne.mockRejectedValueOnce(down);
    roles.findOne.mockResolvedValue({ _id: 'soporte' });
    members.countDocuments.mockRejectedValueOnce(down);
    const role = StaffRole.create({ id: 'soporte', name: 'Soporte', description: '', permissions: [] }, NOW);

    await expect(repository.create(role)).rejects.toBe(down);
    await expect(repository.create(role)).rejects.toBe(otherDuplicate);
    await expect(repository.save(role)).rejects.toBe(down);
    await expect(repository.deleteIfUnused('soporte')).rejects.toBe(down);
    expect(tx.endSession).toHaveBeenCalled();
  });

  it('creates the unique name index', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');

    await new MongoStaffRoleRepository(dbWith(collection), () => fakeSession() as unknown as ClientSession).ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ nameKey: 1 }, { name: 'name_unique', unique: true });
  });
});

describe('MongoAdminSessionStore', () => {
  it('maps a session to its document and back', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({});
    const store = new MongoAdminSessionStore(dbWith(collection));

    await store.add(session());
    const doc = collection.insertOne.mock.calls[0]![0] as Document;
    collection.findOne.mockResolvedValue(doc);

    expect(doc).toMatchObject({ _id: 'sid-1', staffId: 'staff-1', refreshTokenHash: 'h1', previousRefreshTokenHash: null, revokedAt: null });
    expect(await store.findByRefreshHash('h1')).toEqual(session());
    expect(collection.findOne).toHaveBeenCalledWith({ refreshTokenHash: 'h1' });
  });

  it('replaces a session only while its refresh hash is the expected one', async () => {
    const collection = createFakeCollection();
    collection.replaceOne.mockResolvedValueOnce({ matchedCount: 1 }).mockResolvedValueOnce({ matchedCount: 0 });
    const store = new MongoAdminSessionStore(dbWith(collection));
    const rotated = session().rotate('h2', NOW);

    expect(await store.replaceIfCurrent(rotated, 'h1')).toBe(true);
    expect(await store.replaceIfCurrent(rotated, 'h1')).toBe(false);
    expect(collection.replaceOne).toHaveBeenCalledWith({ _id: 'sid-1', refreshTokenHash: 'h1' }, expect.objectContaining({ refreshTokenHash: 'h2' }));
  });

  it('reads by id and by the previous refresh hash, and replaces on update', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);
    collection.replaceOne.mockResolvedValue({});
    const store = new MongoAdminSessionStore(dbWith(collection));

    expect(await store.getById('sid-1')).toBeNull();
    expect(await store.findByPreviousRefreshHash('h0')).toBeNull();
    await store.update(session());

    expect(collection.findOne).toHaveBeenCalledWith({ _id: 'sid-1' });
    expect(collection.findOne).toHaveBeenCalledWith({ previousRefreshTokenHash: 'h0' });
    expect(collection.replaceOne).toHaveBeenCalledWith({ _id: 'sid-1' }, expect.objectContaining({ refreshTokenHash: 'h1' }));
  });

  it('revoking with no open session writes nothing', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([]));
    const store = new MongoAdminSessionStore(dbWith(collection));

    expect(await store.revokeAllForStaff('staff-1', 'staff_disabled', NOW)).toEqual([]);
    expect(collection.updateMany).not.toHaveBeenCalled();
  });

  it("revokes every open session of a member", async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ _id: 'sid-1' }, { _id: 'sid-2' }]));
    collection.updateMany.mockResolvedValue({});
    const store = new MongoAdminSessionStore(dbWith(collection));

    expect(await store.revokeAllForStaff('staff-1', 'staff_disabled', NOW)).toEqual(['sid-1', 'sid-2']);
    expect(collection.find).toHaveBeenCalledWith({ staffId: 'staff-1', revokedAt: null }, { projection: { _id: 1 } });
    expect(collection.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['sid-1', 'sid-2'] }, revokedAt: null },
      { $set: { revokedAt: NOW, revokedReason: 'staff_disabled' } },
    );
  });

  it('creates the refresh, staff and expiry indexes', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');

    await new MongoAdminSessionStore(dbWith(collection)).ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ refreshTokenHash: 1 }, { name: 'refresh_unique', unique: true });
    expect(collection.createIndex).toHaveBeenCalledWith(
      { previousRefreshTokenHash: 1 },
      { name: 'previous_refresh', partialFilterExpression: { previousRefreshTokenHash: { $type: 'string' } } },
    );
    expect(collection.createIndex).toHaveBeenCalledWith({ staffId: 1, revokedAt: 1 }, { name: 'staff_active' });
    expect(collection.createIndex).toHaveBeenCalledWith({ absoluteExpiresAt: 1 }, { name: 'expiry_ttl', expireAfterSeconds: 2592000 });
  });
});

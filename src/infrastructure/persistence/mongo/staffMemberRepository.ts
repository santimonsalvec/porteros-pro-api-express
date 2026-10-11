import type { ClientSession, Collection, Db, Document } from 'mongodb';
import type { IStaffMemberRepository, StaffMemberListQuery } from '../../../application/features/staff/common/ports.js';
import { StaffMember, type StaffStatus } from '../../../domain/staff/staffMember.js';
import { OWNER_ROLE_ID } from '../../../domain/staff/staffRole.js';

export const STAFF_MEMBERS_COLLECTION = 'staffMembers';

/** Thrown inside the transaction so `withTransaction` aborts it without retrying. */
class LastOwnerAbort extends Error {}

function toDocument(member: StaffMember): Document {
  return {
    _id: member.id,
    email: member.email,
    displayName: member.displayName,
    userId: member.userId,
    roleIds: [...member.roleIds],
    status: member.status,
    invitedBy: member.invitedBy,
    invitedAt: member.invitedAt,
    inviteExpiresAt: member.inviteExpiresAt,
    createdAt: member.createdAt,
    lastSignInAt: member.lastSignInAt,
    updatedAt: member.updatedAt,
  };
}

function fromDocument(doc: Document): StaffMember {
  return StaffMember.rehydrate({
    id: String(doc._id),
    email: doc.email as string,
    displayName: (doc.displayName as string | null | undefined) ?? null,
    userId: (doc.userId as string | null | undefined) ?? null,
    roleIds: doc.roleIds as string[],
    status: doc.status as StaffStatus,
    invitedBy: doc.invitedBy as string,
    invitedAt: new Date(doc.invitedAt as Date),
    inviteExpiresAt: doc.inviteExpiresAt ? new Date(doc.inviteExpiresAt as Date) : null,
    createdAt: new Date(doc.createdAt as Date),
    lastSignInAt: doc.lastSignInAt ? new Date(doc.lastSignInAt as Date) : null,
    updatedAt: new Date(doc.updatedAt as Date),
  });
}

const ACTIVE_OWNERS = { roleIds: OWNER_ROLE_ID, status: 'active' };

export class MongoStaffMemberRepository implements IStaffMemberRepository {
  private readonly collection: Collection<Document>;

  constructor(
    db: Db,
    private readonly startSession: () => ClientSession,
  ) {
    this.collection = db.collection(STAFF_MEMBERS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ email: 1 }, { name: 'email_unique', unique: true });
    await this.collection.createIndex(
      { userId: 1 },
      { name: 'userId_unique', unique: true, partialFilterExpression: { userId: { $type: 'string' } } },
    );
    await this.collection.createIndex({ roleIds: 1, status: 1 }, { name: 'role_status' });
  }

  async getById(id: string): Promise<StaffMember | null> {
    const doc = await this.collection.findOne({ _id: id } as Document);
    return doc ? fromDocument(doc) : null;
  }

  async findByEmail(email: string): Promise<StaffMember | null> {
    const doc = await this.collection.findOne({ email });
    return doc ? fromDocument(doc) : null;
  }

  async findByUserId(userId: string): Promise<StaffMember | null> {
    const doc = await this.collection.findOne({ userId });
    return doc ? fromDocument(doc) : null;
  }

  async add(member: StaffMember): Promise<void> {
    await this.collection.insertOne(toDocument(member));
  }

  async update(member: StaffMember): Promise<void> {
    await this.collection.replaceOne({ _id: member.id } as Document, toDocument(member));
  }

  async saveGuardingOwners(member: StaffMember): Promise<'saved' | 'last_owner'> {
    const session = this.startSession();
    try {
      await session.withTransaction(async () => {
        const ownersBefore = await this.collection.countDocuments(ACTIVE_OWNERS, { session });
        await this.collection.replaceOne({ _id: member.id } as Document, toDocument(member), { session });
        const ownersAfter = await this.collection.countDocuments(ACTIVE_OWNERS, { session });
        if (ownersBefore > 0 && ownersAfter === 0) throw new LastOwnerAbort();
      });
      return 'saved';
    } catch (error) {
      if (error instanceof LastOwnerAbort) return 'last_owner';
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async list(query: StaffMemberListQuery): Promise<{ items: StaffMember[]; totalItems: number }> {
    const filter: Document = {};
    if (query.status) filter.status = query.status;
    if (query.roleId) filter.roleIds = query.roleId;
    if (query.q) {
      // A prefix, escaped: the team is small (< 100), so no text index is needed (research §4).
      const prefix = { $regex: `^${query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' };
      filter.$or = [{ email: prefix }, { displayName: prefix }];
    }
    const docs = await this.collection
      .find(filter)
      .sort({ email: 1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .toArray();
    return { items: docs.map(fromDocument), totalItems: await this.collection.countDocuments(filter) };
  }

  async countByRole(roleIds: readonly string[]): Promise<Map<string, number>> {
    const match = { $match: { roleIds: { $in: [...roleIds] } } };
    const rows = await this.collection
      .aggregate<{ _id: string; count: number }>([match, { $unwind: '$roleIds' }, match, { $group: { _id: '$roleIds', count: { $sum: 1 } } }])
      .toArray();
    return new Map(rows.map((row) => [row._id, row.count]));
  }
}

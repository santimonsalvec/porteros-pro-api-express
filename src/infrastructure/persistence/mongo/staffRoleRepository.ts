import type { ClientSession, Collection, Db, Document } from 'mongodb';
import type { IStaffRoleRepository } from '../../../application/features/staff/common/ports.js';
import { OWNER_ROLE_ID, StaffRole } from '../../../domain/staff/staffRole.js';
import { STAFF_MEMBERS_COLLECTION } from './staffMemberRepository.js';

export const STAFF_ROLES_COLLECTION = 'staffRoles';

function toDocument(role: StaffRole): Document {
  return {
    _id: role.id,
    name: role.name,
    // Role names are unique regardless of case.
    nameKey: role.name.toLowerCase(),
    description: role.description,
    permissions: [...role.permissions],
    system: role.system,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

function fromDocument(doc: Document): StaffRole {
  return StaffRole.rehydrate({
    id: String(doc._id),
    name: doc.name as string,
    description: (doc.description as string | undefined) ?? '',
    permissions: (doc.permissions as string[] | undefined) ?? [],
    system: Boolean(doc.system),
    createdAt: new Date(doc.createdAt as Date),
    updatedAt: new Date(doc.updatedAt as Date),
  });
}

const DUPLICATE_KEY = 11000;

/** Thrown inside the transaction so `withTransaction` aborts it without retrying. */
class InUseAbort extends Error {}

function isDuplicateName(error: unknown): boolean {
  const { code, keyPattern } = (error ?? {}) as { code?: unknown; keyPattern?: unknown };
  return code === DUPLICATE_KEY && typeof keyPattern === 'object' && keyPattern !== null && 'nameKey' in keyPattern;
}

export class MongoStaffRoleRepository implements IStaffRoleRepository {
  private readonly collection: Collection<Document>;
  private readonly members: Collection<Document>;

  constructor(
    db: Db,
    private readonly startSession: () => ClientSession,
  ) {
    this.collection = db.collection(STAFF_ROLES_COLLECTION);
    this.members = db.collection(STAFF_MEMBERS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ nameKey: 1 }, { name: 'name_unique', unique: true });
  }

  async getById(id: string): Promise<StaffRole | null> {
    const doc = await this.collection.findOne({ _id: id } as Document);
    return doc ? fromDocument(doc) : null;
  }

  async upsert(role: StaffRole): Promise<void> {
    await this.collection.replaceOne({ _id: role.id } as Document, toDocument(role), { upsert: true });
  }

  async ensureOwner(now: Date): Promise<StaffRole> {
    const { _id, ...owner } = toDocument(StaffRole.owner(now));
    await this.collection.updateOne({ _id } as Document, { $setOnInsert: owner }, { upsert: true });
    const doc = await this.collection.findOne({ _id: OWNER_ROLE_ID } as Document);
    return fromDocument(doc!);
  }

  async list(page: number, pageSize: number): Promise<{ items: StaffRole[]; totalItems: number }> {
    const docs = await this.collection
      .find({})
      .sort({ system: -1, nameKey: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();
    return { items: docs.map(fromDocument), totalItems: await this.collection.countDocuments({}) };
  }

  async create(role: StaffRole): Promise<'created' | 'name_taken'> {
    try {
      await this.collection.insertOne(toDocument(role));
      return 'created';
    } catch (error) {
      if (isDuplicateName(error)) return 'name_taken';
      throw error;
    }
  }

  async save(role: StaffRole): Promise<'saved' | 'name_taken'> {
    try {
      await this.collection.replaceOne({ _id: role.id } as Document, toDocument(role));
      return 'saved';
    } catch (error) {
      if (isDuplicateName(error)) return 'name_taken';
      throw error;
    }
  }

  async deleteIfUnused(roleId: string): Promise<'deleted' | 'in_use' | 'not_found'> {
    if (!(await this.collection.findOne({ _id: roleId } as Document))) return 'not_found';
    const session = this.startSession();
    try {
      await session.withTransaction(async () => {
        if ((await this.members.countDocuments({ roleIds: roleId }, { session })) > 0) throw new InUseAbort();
        await this.collection.deleteOne({ _id: roleId } as Document, { session });
      });
      return 'deleted';
    } catch (error) {
      if (error instanceof InUseAbort) return 'in_use';
      throw error;
    } finally {
      await session.endSession();
    }
  }
}

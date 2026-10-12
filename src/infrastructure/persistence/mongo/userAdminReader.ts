import type { Collection, Db, Document } from 'mongodb';
import type { IUserAdminReader, ScheduledRecord, UserListFilter, UserListRecord } from '../../../application/features/users/common/ports.js';
import { userSearchMatch } from '../../../application/features/users/common/userSearch.js';
import { BOOKINGS_COLLECTION } from './bookingRepository.js';
import { DEVICES_COLLECTION } from './deviceRepository.js';
import { GOALKEEPER_REQUESTS_COLLECTION } from './goalkeeperRequestRepository.js';
import { usersListPipeline } from './userAdminPipelines.js';

/** A request is open while one of its bookings is still searching or assigned. */
const OPEN_BOOKING_STATUSES = ['pending_assignment', 'assigned'];

/** The admin's reads of users that need a search or a join (admin spec 005, research §4). */
export class UserAdminReader implements IUserAdminReader {
  private readonly users: Collection<Document>;
  private readonly termsAcceptances: Collection<Document>;
  private readonly devicesCollection: Collection<Document>;
  private readonly requests: Collection<Document>;
  private readonly bookings: Collection<Document>;

  constructor(db: Db) {
    this.users = db.collection('users');
    this.termsAcceptances = db.collection('termsAcceptances');
    this.devicesCollection = db.collection(DEVICES_COLLECTION);
    this.requests = db.collection(GOALKEEPER_REQUESTS_COLLECTION);
    this.bookings = db.collection(BOOKINGS_COLLECTION);
  }

  async list(filter: UserListFilter): Promise<{ items: UserListRecord[]; totalItems: number }> {
    const [result] = await this.users.aggregate<{ items: Document[]; total: { count: number }[] }>(usersListPipeline(filter)).toArray();
    return { items: (result?.items ?? []).map(toRecord), totalItems: result?.total[0]?.count ?? 0 };
  }

  async findIds(q: string, limit: number): Promise<string[]> {
    const match = userSearchMatch(q);
    if (!match) return [];
    const docs = await this.users.find(match, { projection: { _id: 1 } }).limit(limit).toArray();
    return docs.map((doc) => String(doc._id));
  }

  async terms(userId: string): Promise<{ version: string; acceptedAt: Date }[]> {
    const docs = await this.termsAcceptances.find({ userId }).sort({ acceptedAt: -1 }).toArray();
    return docs.map((doc) => ({ version: doc.termsVersion as string, acceptedAt: new Date(doc.acceptedAt as Date) }));
  }

  async devices(userId: string): Promise<{ platform: string; lastSeenAt: Date }[]> {
    // The push token is the device's key and never leaves the server: projected out.
    const docs = await this.devicesCollection.find({ userId }, { projection: { _id: 0, platform: 1, lastSeenAt: 1 } }).sort({ lastSeenAt: -1 }).toArray();
    return docs.map((doc) => ({ platform: doc.platform as string, lastSeenAt: new Date(doc.lastSeenAt as Date) }));
  }

  async requestCount(userId: string): Promise<number> {
    return this.requests.countDocuments({ clientId: userId });
  }

  async openRequests(userId: string, now: Date, limit: number): Promise<{ total: number; items: ScheduledRecord[] }> {
    const future = await this.requests
      .find({ clientId: userId, startsAt: { $gt: now } }, { projection: { _id: 1, startsAt: 1, zoneId: 1 } })
      .sort({ startsAt: 1 })
      .toArray();
    if (future.length === 0) return { total: 0, items: [] };
    const open = new Set(
      (await this.bookings.distinct('requestId', { requestId: { $in: future.map((doc) => doc._id) }, status: { $in: OPEN_BOOKING_STATUSES } })).map(String),
    );
    const items = future
      .filter((doc) => open.has(String(doc._id)))
      .map((doc) => ({ id: String(doc._id), startsAt: new Date(doc.startsAt as Date), zoneId: (doc.zoneId as string | undefined) ?? null }));
    return { total: items.length, items: items.slice(0, limit) };
  }
}

function toRecord(doc: Document): UserListRecord {
  return {
    id: String(doc._id),
    firstName: (doc.firstName as string | undefined) ?? null,
    lastName: (doc.lastName as string | undefined) ?? null,
    displayName: (doc.displayName as string | undefined) ?? null,
    email: doc.email as string,
    countryCallingCode: (doc.countryCallingCode as string | undefined) ?? null,
    createdAt: new Date(doc.created as Date),
    isProfileComplete: Boolean(doc.isProfileComplete),
    isGoalkeeper: Boolean(doc.isGoalkeeper),
    blocked: Boolean(doc.blocked),
  };
}

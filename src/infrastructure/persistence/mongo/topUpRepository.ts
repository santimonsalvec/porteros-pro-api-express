import type { Collection, Db, Document } from 'mongodb';
import type { ITopUpRepository } from '../../../application/features/payments/common/ports.js';
import type { GatewayEnvironment, GatewayName } from '../../../domain/payments/gatewaySettings.js';
import { CHECK_LEASE_SECONDS, CHECK_LOG_MAX, isSameCheck, TopUp, type TopUpCheck, type TopUpStatus } from '../../../domain/payments/topUp.js';

export const TOP_UPS_COLLECTION = 'topUps';

const dateOrNull = (value: unknown): Date | null => (value ? new Date(value as Date) : null);

export function topUpToDocument(topUp: TopUp): Document {
  return {
    _id: topUp.id,
    goalkeeperId: topUp.goalkeeperId,
    countryId: topUp.countryId,
    gateway: topUp.gateway,
    environment: topUp.environment,
    reference: topUp.reference,
    gatewayTransactionId: topUp.gatewayTransactionId,
    amount: topUp.amount,
    cost: topUp.cost,
    net: topUp.net,
    currency: topUp.currency,
    status: topUp.status,
    createdAt: topUp.createdAt,
    finalizedAt: topUp.finalizedAt,
    lastCheckedAt: topUp.lastCheckedAt,
    nextCheckAt: topUp.nextCheckAt,
    checks: topUp.checks,
  };
}

export function topUpFromDocument(doc: Document): TopUp {
  return TopUp.rehydrate({
    id: String(doc._id),
    goalkeeperId: doc.goalkeeperId as string,
    countryId: doc.countryId as string,
    gateway: doc.gateway as GatewayName,
    environment: doc.environment as GatewayEnvironment,
    reference: doc.reference as string,
    gatewayTransactionId: (doc.gatewayTransactionId as string | null | undefined) ?? null,
    amount: doc.amount as number,
    cost: doc.cost as number,
    net: doc.net as number,
    currency: doc.currency as string,
    status: doc.status as TopUpStatus,
    createdAt: new Date(doc.createdAt as Date),
    finalizedAt: dateOrNull(doc.finalizedAt),
    lastCheckedAt: dateOrNull(doc.lastCheckedAt),
    nextCheckAt: dateOrNull(doc.nextCheckAt),
    checks: (doc.checks as number | undefined) ?? 0,
  });
}

/** Wallet top-ups (feature 022). Status changes after creation go through the top-up store only. */
export class TopUpRepository implements ITopUpRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(TOP_UPS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ reference: 1 }, { name: 'reference_unique', unique: true });
    await this.collection.createIndex({ goalkeeperId: 1, createdAt: -1, _id: -1 }, { name: 'goalkeeper_created' });
    await this.collection.createIndex({ status: 1, nextCheckAt: 1 }, { name: 'status_nextCheck' });
  }

  /** The admin's lists (admin spec 007, research §3): newest first, by status or by country. */
  async ensureAdminIndexes(): Promise<void> {
    await this.collection.createIndex({ createdAt: -1, _id: -1 }, { name: 'created_id' });
    await this.collection.createIndex({ status: 1, createdAt: -1, _id: -1 }, { name: 'status_created' });
    await this.collection.createIndex({ countryId: 1, createdAt: -1, _id: -1 }, { name: 'country_created' });
  }

  async create(topUp: TopUp): Promise<void> {
    await this.collection.insertOne(topUpToDocument(topUp));
  }

  async getById(id: string): Promise<TopUp | null> {
    const doc = await this.collection.findOne({ _id: id } as Document);
    return doc ? topUpFromDocument(doc) : null;
  }

  async getByReference(reference: string): Promise<TopUp | null> {
    const doc = await this.collection.findOne({ reference });
    return doc ? topUpFromDocument(doc) : null;
  }

  async listForGoalkeeper(goalkeeperId: string, skip: number, limit: number): Promise<TopUp[]> {
    const docs = await this.collection.find({ goalkeeperId }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).toArray();
    return docs.map(topUpFromDocument);
  }

  countForGoalkeeper(goalkeeperId: string): Promise<number> {
    return this.collection.countDocuments({ goalkeeperId });
  }

  async findDueForCheck(now: Date, cap: number): Promise<TopUp[]> {
    const docs = await this.collection
      .find({ status: 'pending', nextCheckAt: { $lte: now } })
      .sort({ nextCheckAt: 1 })
      .limit(cap)
      .toArray();
    return docs.map(topUpFromDocument);
  }

  async scheduleNextCheck(id: string, nextCheckAt: Date, now: Date): Promise<void> {
    await this.collection.updateOne(
      { _id: id, status: 'pending' } as Document,
      { $set: { nextCheckAt, lastCheckedAt: now }, $inc: { checks: 1 } },
    );
  }

  /**
   * Keeps one ask to the gateway on the top-up (admin spec 007, research §1), newest last and at most
   * 50; an equal ask right after the last one only moves its `lastAt` and counts a repeat. Never touches
   * the sweep's schedule. Read-then-write is safe: the check lease lets one ask run at a time.
   */
  async recordCheck(id: string, entry: TopUpCheck): Promise<void> {
    const doc = await this.collection.findOne({ _id: id } as Document, { projection: { checkLog: { $slice: -1 } } });
    if (!doc) return;
    const last = (doc.checkLog as TopUpCheck[] | undefined)?.at(-1);
    if (last && isSameCheck(last, entry)) {
      await this.collection.updateOne(
        { _id: id } as Document,
        { $set: { 'checkLog.$[last].lastAt': entry.lastAt }, $inc: { 'checkLog.$[last].repeats': 1 } },
        { arrayFilters: [{ 'last.at': last.at }] },
      );
      return;
    }
    await this.collection.updateOne({ _id: id } as Document, { $push: { checkLog: { $each: [entry], $slice: -CHECK_LOG_MAX } } } as Document);
  }

  /** Holds the top-up for 30 seconds if nobody does; `false` when another ask is in flight. */
  async acquireCheckLease(id: string, now: Date): Promise<boolean> {
    const held = await this.collection.findOneAndUpdate(
      { _id: id, $or: [{ checkLeaseUntil: null }, { checkLeaseUntil: { $exists: false } }, { checkLeaseUntil: { $lte: now } }] } as Document,
      { $set: { checkLeaseUntil: new Date(now.getTime() + CHECK_LEASE_SECONDS * 1000) } },
      { projection: { _id: 1 } },
    );
    return held !== null;
  }

  async releaseCheckLease(id: string): Promise<void> {
    await this.collection.updateOne({ _id: id } as Document, { $set: { checkLeaseUntil: null } });
  }
}

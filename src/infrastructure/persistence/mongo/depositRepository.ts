import type { Collection, Db, Document } from 'mongodb';
import type { IDepositRepository } from '../../../application/features/payments/common/ports.js';
import type { GatewayEnvironment, GatewayName } from '../../../domain/payments/gatewaySettings.js';
import { CHECK_LEASE_SECONDS, CHECK_LOG_MAX, isSameCheck, Deposit, type DepositCheck, type DepositStatus } from '../../../domain/deposits/deposit.js';

export const DEPOSITS_COLLECTION = 'deposits';

const dateOrNull = (value: unknown): Date | null => (value ? new Date(value as Date) : null);

export function depositToDocument(deposit: Deposit): Document {
  return {
    _id: deposit.id,
    goalkeeperId: deposit.goalkeeperId,
    countryId: deposit.countryId,
    marketId: deposit.marketId,
    gateway: deposit.gateway,
    environment: deposit.environment,
    reference: deposit.reference,
    gatewayTransactionId: deposit.gatewayTransactionId,
    amount: deposit.amount,
    cost: deposit.cost,
    net: deposit.net,
    currency: deposit.currency,
    status: deposit.status,
    createdAt: deposit.createdAt,
    finalizedAt: deposit.finalizedAt,
    lastCheckedAt: deposit.lastCheckedAt,
    nextCheckAt: deposit.nextCheckAt,
    checks: deposit.checks,
  };
}

export function depositFromDocument(doc: Document): Deposit {
  return Deposit.rehydrate({
    id: String(doc._id),
    goalkeeperId: doc.goalkeeperId as string,
    countryId: doc.countryId as string,
    marketId: doc.marketId as string,
    gateway: doc.gateway as GatewayName,
    environment: doc.environment as GatewayEnvironment,
    reference: doc.reference as string,
    gatewayTransactionId: (doc.gatewayTransactionId as string | null | undefined) ?? null,
    amount: doc.amount as number,
    cost: doc.cost as number,
    net: doc.net as number,
    currency: doc.currency as string,
    status: doc.status as DepositStatus,
    createdAt: new Date(doc.createdAt as Date),
    finalizedAt: dateOrNull(doc.finalizedAt),
    lastCheckedAt: dateOrNull(doc.lastCheckedAt),
    nextCheckAt: dateOrNull(doc.nextCheckAt),
    checks: (doc.checks as number | undefined) ?? 0,
  });
}

/** Operating balance deposits (feature 022). Status changes after creation go through the deposit store only. */
export class DepositRepository implements IDepositRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(DEPOSITS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ reference: 1 }, { name: 'reference_unique', unique: true });
    await this.collection.createIndex({ goalkeeperId: 1, createdAt: -1, _id: -1 }, { name: 'goalkeeper_created' });
    // Spec 031: a market's deposits, which stay there when a goalkeeper leaves.
    await this.collection.createIndex({ marketId: 1, createdAt: -1 }, { name: 'market_created' });
    await this.collection.createIndex({ status: 1, nextCheckAt: 1 }, { name: 'status_nextCheck' });
  }

  /** The admin's lists (admin spec 007, research §3): newest first, by status or by country. */
  async ensureAdminIndexes(): Promise<void> {
    await this.collection.createIndex({ createdAt: -1, _id: -1 }, { name: 'created_id' });
    await this.collection.createIndex({ status: 1, createdAt: -1, _id: -1 }, { name: 'status_created' });
    await this.collection.createIndex({ countryId: 1, createdAt: -1, _id: -1 }, { name: 'country_created' });
  }

  async create(deposit: Deposit): Promise<void> {
    await this.collection.insertOne(depositToDocument(deposit));
  }

  async getById(id: string): Promise<Deposit | null> {
    const doc = await this.collection.findOne({ _id: id } as Document);
    return doc ? depositFromDocument(doc) : null;
  }

  async getByReference(reference: string): Promise<Deposit | null> {
    const doc = await this.collection.findOne({ reference });
    return doc ? depositFromDocument(doc) : null;
  }

  async listForGoalkeeper(goalkeeperId: string, skip: number, limit: number): Promise<Deposit[]> {
    const docs = await this.collection.find({ goalkeeperId }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).toArray();
    return docs.map(depositFromDocument);
  }

  countForGoalkeeper(goalkeeperId: string): Promise<number> {
    return this.collection.countDocuments({ goalkeeperId });
  }

  async findPendingForGoalkeeper(goalkeeperId: string): Promise<Deposit[]> {
    const docs = await this.collection.find({ goalkeeperId, status: 'pending' }).sort({ createdAt: -1, _id: -1 }).toArray();
    return docs.map(depositFromDocument);
  }

  async findDueForCheck(now: Date, cap: number): Promise<Deposit[]> {
    const docs = await this.collection
      .find({ status: 'pending', nextCheckAt: { $lte: now } })
      .sort({ nextCheckAt: 1 })
      .limit(cap)
      .toArray();
    return docs.map(depositFromDocument);
  }

  async scheduleNextCheck(id: string, nextCheckAt: Date, now: Date): Promise<void> {
    await this.collection.updateOne(
      { _id: id, status: 'pending' } as Document,
      { $set: { nextCheckAt, lastCheckedAt: now }, $inc: { checks: 1 } },
    );
  }

  /**
   * Keeps one ask to the gateway on the deposit (admin spec 007, research §1), newest last and at most
   * 50; an equal ask right after the last one only moves its `lastAt` and counts a repeat. Never touches
   * the sweep's schedule. Read-then-write is safe: the check lease lets one ask run at a time.
   */
  async recordCheck(id: string, entry: DepositCheck): Promise<void> {
    const doc = await this.collection.findOne({ _id: id } as Document, { projection: { checkLog: { $slice: -1 } } });
    if (!doc) return;
    const last = (doc.checkLog as DepositCheck[] | undefined)?.at(-1);
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

  /** Holds the deposit for 30 seconds if nobody does; `false` when another ask is in flight. */
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

import type { Collection, Db, Document } from 'mongodb';
import type { ITopUpRepository } from '../../../application/features/payments/common/ports.js';
import type { GatewayEnvironment, GatewayName } from '../../../domain/payments/gatewaySettings.js';
import { TopUp, type TopUpStatus } from '../../../domain/payments/topUp.js';

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
}

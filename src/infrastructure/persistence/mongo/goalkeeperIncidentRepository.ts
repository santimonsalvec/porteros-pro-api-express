import type { Collection, Db, Document } from 'mongodb';
import type { IGoalkeeperIncidentRepository } from '../../../application/features/bookingLifecycle/common/ports.js';
import {
  GoalkeeperIncident,
  type AdminDecision,
  type IncidentKind,
  type MoneyReversal,
  type Penalty,
} from '../../../domain/goalkeepers/goalkeeperIncident.js';

export const GOALKEEPER_INCIDENTS_COLLECTION = 'goalkeeperIncidents';

export function incidentToDocument(incident: GoalkeeperIncident): Document {
  return {
    _id: incident.id,
    kind: incident.kind,
    goalkeeperId: incident.goalkeeperId,
    bookingId: incident.bookingId,
    requestId: incident.requestId,
    startsAt: incident.startsAt,
    occurredAt: incident.occurredAt,
    noticeMinutes: incident.noticeMinutes,
    late: incident.late,
    reason: incident.reason,
    replacementBookingId: incident.replacementBookingId,
    penalties: incident.penalties.map((penalty) => ({ ...penalty })),
    moneyReversal: incident.moneyReversal,
    forgivenAt: incident.forgivenAt,
  };
}

function decisionFrom(doc: Document | null | undefined): AdminDecision | null {
  if (!doc) return null;
  return { by: doc.by as string, at: new Date(doc.at as Date), reason: doc.reason as string };
}

export function incidentFromDocument(doc: Document): GoalkeeperIncident {
  const money = doc.moneyReversal as Document | null | undefined;
  return GoalkeeperIncident.rehydrate({
    id: String(doc._id),
    kind: doc.kind as IncidentKind,
    goalkeeperId: doc.goalkeeperId as string,
    bookingId: doc.bookingId as string,
    requestId: doc.requestId as string,
    startsAt: new Date(doc.startsAt as Date),
    occurredAt: new Date(doc.occurredAt as Date),
    noticeMinutes: doc.noticeMinutes as number,
    late: doc.late as boolean,
    reason: (doc.reason as string | null | undefined) ?? null,
    replacementBookingId: (doc.replacementBookingId as string | null | undefined) ?? null,
    penalties: ((doc.penalties as Document[] | undefined) ?? []).map(
      (penalty): Penalty => ({
        id: penalty.id as string,
        kind: penalty.kind as Penalty['kind'],
        days: penalty.days as number,
        startsAt: new Date(penalty.startsAt as Date),
        endsAt: new Date(penalty.endsAt as Date),
        reversal: decisionFrom(penalty.reversal as Document | null | undefined),
      }),
    ),
    moneyReversal: money
      ? ({ ...decisionFrom(money)!, amount: money.amount as number, currency: money.currency as string } satisfies MoneyReversal)
      : null,
    forgivenAt: doc.forgivenAt ? new Date(doc.forgivenAt as Date) : null,
  });
}

/**
 * A goalkeeper's incidents (feature 018). Written only inside the lifecycle store's transactions;
 * this repository reads them for the histories.
 */
export class GoalkeeperIncidentRepository implements IGoalkeeperIncidentRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(GOALKEEPER_INCIDENTS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ goalkeeperId: 1, occurredAt: -1, _id: -1 }, { name: 'goalkeeper_occurred' });
    await this.collection.createIndex({ kind: 1, bookingId: 1 }, { name: 'kind_booking_unique', unique: true });
  }

  async listForGoalkeeper(goalkeeperId: string, skip: number, limit: number): Promise<GoalkeeperIncident[]> {
    const docs = await this.collection.find({ goalkeeperId }).sort({ occurredAt: -1, _id: -1 }).skip(skip).limit(limit).toArray();
    return docs.map(incidentFromDocument);
  }

  countForGoalkeeper(goalkeeperId: string): Promise<number> {
    return this.collection.countDocuments({ goalkeeperId });
  }
}

import type { Collection, Db, Document } from 'mongodb';
import type {
  BookingMoneyRecord,
  CheckInPhotoRecord,
  IRequestAdminReader,
  RequestDetailRecord,
  RequestListFilter,
  RequestListRecord,
} from '../../../application/features/goalkeeperRequests/common/adminPorts.js';
import { OFFER_TYPE } from '../../../domain/notifications/offerMessages.js';
import { BOOKINGS_COLLECTION, bookingFromDocument } from './bookingRepository.js';
import { CASES_COLLECTION, caseFromDocument } from './caseRepository.js';
import { GOALKEEPER_INCIDENTS_COLLECTION, incidentFromDocument } from './goalkeeperIncidentRepository.js';
import { GOALKEEPER_REQUESTS_COLLECTION, requestFromDocument } from './goalkeeperRequestRepository.js';
import { NOTIFICATIONS_COLLECTION } from './notificationRepository.js';
import { RATINGS_COLLECTION, ratingFromDocument } from './ratingRepository.js';
import { requestsListPipeline } from './requestAdminPipelines.js';
import { WALLET_MOVEMENTS_COLLECTION } from './walletMovementRepository.js';

/** The cause keys of one booking's commission (016–018, 023): charge and refund, with their VAT. */
const MONEY_KEYS = ['commission', 'commission_vat', 'commission_refund', 'commission_vat_refund'] as const;

/**
 * The admin's reads of requests (admin spec 006, research §6–§8). Every read goes by an index:
 * requests by date, city or client; bookings by `requestId`; movements by `causeKey`; incidents by
 * `kind` + `bookingId`; ratings and cases by `bookingId`; offers by `offer_request`.
 */
export class RequestAdminReader implements IRequestAdminReader {
  private readonly regions: Collection<Document>;
  private readonly cities: Collection<Document>;
  private readonly requests: Collection<Document>;
  private readonly bookings: Collection<Document>;
  private readonly movements: Collection<Document>;
  private readonly incidents: Collection<Document>;
  private readonly ratings: Collection<Document>;
  private readonly cases: Collection<Document>;
  private readonly notifications: Collection<Document>;

  constructor(db: Db) {
    this.regions = db.collection('regions');
    this.cities = db.collection('cities');
    this.requests = db.collection(GOALKEEPER_REQUESTS_COLLECTION);
    this.bookings = db.collection(BOOKINGS_COLLECTION);
    this.movements = db.collection(WALLET_MOVEMENTS_COLLECTION);
    this.incidents = db.collection(GOALKEEPER_INCIDENTS_COLLECTION);
    this.ratings = db.collection(RATINGS_COLLECTION);
    this.cases = db.collection(CASES_COLLECTION);
    this.notifications = db.collection(NOTIFICATIONS_COLLECTION);
  }

  async cityIdsOfCountry(countryId: string): Promise<string[]> {
    const regions = await this.regions.find({ countryId } as Document, { projection: { _id: 1 } }).toArray();
    if (regions.length === 0) return [];
    const cities = await this.cities.find({ regionId: { $in: regions.map((doc) => doc._id) } } as Document, { projection: { _id: 1 } }).toArray();
    return cities.map((doc) => String(doc._id));
  }

  async requestIdsOfGoalkeeper(goalkeeperId: string, limit: number): Promise<string[]> {
    const ids = await this.bookings.distinct('requestId', { goalkeeperId } as Document);
    return ids.slice(0, limit).map(String);
  }

  async requestIdsInCities(requestIds: readonly string[], cityIds: readonly string[]): Promise<string[]> {
    if (requestIds.length === 0 || cityIds.length === 0) return [];
    const docs = await this.requests
      .find({ _id: { $in: [...requestIds] }, 'match.cityId': { $in: [...cityIds] } } as Document, { projection: { _id: 1 } })
      .toArray();
    return docs.map((doc) => String(doc._id));
  }

  async list(filter: RequestListFilter): Promise<{ items: RequestListRecord[]; totalItems: number }> {
    // A country without cities, or a goalkeeper without requests, matches nothing.
    if (filter.cityIds?.length === 0 || filter.requestIds?.length === 0) return { items: [], totalItems: 0 };
    const [result] = await this.requests.aggregate<{ items: Document[]; total: { count: number }[] }>(requestsListPipeline(filter)).toArray();
    return { items: (result?.items ?? []).map(toListRecord), totalItems: result?.total[0]?.count ?? 0 };
  }

  async detail(requestId: string): Promise<RequestDetailRecord | null> {
    const requestDoc = await this.requests.findOne({ _id: requestId } as Document);
    if (!requestDoc) return null;
    const bookings = (await this.bookings.find({ requestId } as Document).sort({ createdAt: 1, _id: 1 }).toArray()).map(bookingFromDocument);
    const ids = bookings.map((booking) => booking.id);
    const [movements, incidents, ratings, cases, offersSent] = await Promise.all([
      this.movements.find({ causeKey: { $in: ids.flatMap((id) => MONEY_KEYS.map((key) => `${key}:${id}`)) } } as Document).toArray(),
      this.incidents.find({ kind: { $in: ['withdrawal', 'no_show'] }, bookingId: { $in: ids } } as Document).toArray(),
      this.ratings.find({ bookingId: { $in: ids } } as Document).toArray(),
      this.cases.find({ bookingId: { $in: ids } } as Document).toArray(),
      this.notifications.countDocuments({ requestId, type: OFFER_TYPE } as Document),
    ]);
    return {
      request: requestFromDocument(requestDoc),
      bookings,
      money: moneyByBooking(movements),
      incidents: incidents.map(incidentFromDocument),
      ratings: ratings.map(ratingFromDocument),
      cases: cases.map(caseFromDocument),
      offersSent,
    };
  }

  async checkInPhoto(bookingId: string, requestId?: string): Promise<CheckInPhotoRecord> {
    const doc = await this.bookings.findOne({ _id: bookingId } as Document);
    if (!doc || (requestId !== undefined && doc.requestId !== requestId)) return { outcome: 'booking_not_found' };
    const booking = bookingFromDocument(doc);
    if (!booking.checkIn) return { outcome: 'check_in_not_found' };
    return { outcome: 'ok', photoUrl: booking.checkIn.photoUrl, at: booking.checkIn.at };
  }
}

function toListRecord(doc: Document): RequestListRecord {
  const match = (doc.match ?? {}) as Document;
  const pricing = (doc.pricing ?? {}) as Document;
  return {
    requestId: String(doc._id),
    clientId: doc.clientId as string,
    startsAt: new Date(doc.startsAt as Date),
    timeZone: match.timeZone as string,
    cityId: match.cityId as string,
    zoneId: doc.zoneId as string,
    goalkeeperCount: match.goalkeeperCount as number,
    counts: {
      pending: doc.pending as number,
      assigned: doc.assigned as number,
      completed: doc.completed as number,
      cancelled: doc.cancelled as number,
      expired: doc.expired as number,
    },
    total: pricing.total as number,
    currency: pricing.currency as string,
    createdAt: new Date(doc.createdAt as Date),
  };
}

/** Charges are stored negative and refunds positive; the view shows both as positive amounts. */
function moneyByBooking(movements: Document[]): Map<string, BookingMoneyRecord> {
  const money = new Map<string, BookingMoneyRecord>();
  for (const movement of movements) {
    const [key, bookingId] = String(movement.causeKey).split(/:(.*)/s) as [string, string];
    const record = money.get(bookingId) ?? { charged: 0, chargedVat: 0, refunded: 0, refundedVat: 0, currency: movement.currency as string };
    const amount = Math.abs(movement.amount as number);
    if (key === 'commission') record.charged += amount;
    else if (key === 'commission_vat') record.chargedVat += amount;
    else if (key === 'commission_refund') record.refunded += amount;
    else if (key === 'commission_vat_refund') record.refundedVat += amount;
    money.set(bookingId, record);
  }
  return money;
}

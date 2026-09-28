import type { Booking } from '../../../../domain/bookings/booking.js';
import type { PushMessage } from '../../../../domain/devices/deviceRules.js';
import { groupedOfferMessage, singleOfferMessage } from '../../../../domain/notifications/offerMessages.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type { IPushNotifier } from '../../devices/common/ports.js';
import { runWithConcurrency } from '../../devices/common/runWithConcurrency.js';
import { loadBookingItemContext, type BookingItemContext } from '../../goalkeeperRequests/common/goalkeeperBookingResponse.js';
import type { IGoalkeeperRequestRepository } from '../../goalkeeperRequests/common/ports.js';
import type { ICityRepository } from '../../locations/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { INotificationRepository, IOfferPushState, IOffersLogger } from './ports.js';

/**
 * - `first`: a new booking's offers; only the offers this call creates are pushed.
 * - `catchUp`: the goalkeeper just turned offers on; likewise only newly created offers.
 * - `round`: a reminder round; every open offer counts, after an atomic per-goalkeeper claim.
 * - `renew`: a replacement booking (feature 018); like `first`, but a goalkeeper's existing offer
 *   for the request is reopened for the new booking, so even one who dismissed it hears again.
 */
export type OfferSendMode = 'first' | 'catchUp' | 'round' | 'renew';

export interface OfferSendReport {
  goalkeepers: number;
  entriesCreated: number;
  pushed: number;
  reached: number;
  removed: number;
  failed: number;
}

export interface OfferSenderDependencies {
  notifications: INotificationRepository;
  pushState: IOfferPushState;
  pushNotifier: IPushNotifier;
  idGenerator: IIdGenerator;
  requestRepository: IGoalkeeperRequestRepository;
  zoneRepository: IZoneRepository;
  cityRepository: ICityRepository;
  logger: IOffersLogger;
  maxReminders: number;
  intervalMinutes: number;
}

/** One offer to push to one goalkeeper: its request, the booking it opens, and whether it's its first push. */
interface PendingOffer {
  offerId: string;
  requestId: string;
  booking: Booking;
  first: boolean;
}

const SEND_GROUPS_IN_FLIGHT = 10;

/**
 * The one path every offer takes (research §4, §6, §8): create the inbox entries, pick what to
 * push, claim, send ONE push per goalkeeper (a match or a grouped count), then record first
 * pushes and reminders. Never throws: a failure is logged and the partial report returned.
 */
export class OfferSender {
  constructor(private readonly deps: OfferSenderDependencies) {}

  async send(byGoalkeeper: ReadonlyMap<string, readonly Booking[]>, now: Date, mode: OfferSendMode): Promise<OfferSendReport> {
    const report: OfferSendReport = { goalkeepers: byGoalkeeper.size, entriesCreated: 0, pushed: 0, reached: 0, removed: 0, failed: 0 };
    if (byGoalkeeper.size === 0) return report;
    try {
      const context = await loadBookingItemContext(this.deps, [...byGoalkeeper.values()].flat());
      const toPush = new Map<string, PendingOffer[]>();

      for (const [goalkeeperId, bookings] of byGoalkeeper) {
        const representatives = representativeByRequest(bookings);
        const inserted: PendingOffer[] = [];
        for (const booking of representatives.values()) {
          const message = this.offerMessage(booking, context);
          const offer = {
            id: this.deps.idGenerator.newId(),
            userId: goalkeeperId,
            requestId: booking.requestId,
            title: message.title,
            body: message.body,
            data: message.data,
            createdAt: now,
          };
          const offerId =
            mode === 'renew'
              ? await this.deps.notifications.renewOffer(offer)
              : (await this.deps.notifications.createOfferIfAbsent(offer))
                ? offer.id
                : null;
          if (offerId) inserted.push({ offerId, requestId: booking.requestId, booking, first: true });
        }
        report.entriesCreated += inserted.length;
        toPush.set(goalkeeperId, mode === 'round' ? await this.openOffers(goalkeeperId, representatives) : inserted);
      }

      const recipients = await this.claim(toPush, now, mode);
      report.pushed = recipients.length;
      await this.push(recipients, toPush, context, report);
      await this.record(recipients, toPush, now);
      return report;
    } catch (err) {
      this.deps.logger.warn({ outcome: 'offer_send_failed', mode, err }, 'Sending offers failed');
      return report;
    }
  }

  /** In a round: the goalkeeper's offers for these requests that were not opened, dismissed or reminded enough. */
  private async openOffers(goalkeeperId: string, representatives: ReadonlyMap<string, Booking>): Promise<PendingOffer[]> {
    const offers = await this.deps.notifications.findOffers([goalkeeperId], [...representatives.keys()]);
    return offers
      .filter(
        (offer) =>
          offer.readAt === null &&
          offer.dismissedAt === null &&
          (offer.notifiedAt === null || offer.reminderCount < this.deps.maxReminders),
      )
      .map((offer) => ({
        offerId: offer.id,
        requestId: offer.requestId!,
        booking: representatives.get(offer.requestId!)!,
        first: offer.notifiedAt === null,
      }));
  }

  /** Who gets a push now: everyone with something to push, but in a round only after winning the claim. */
  private async claim(toPush: ReadonlyMap<string, PendingOffer[]>, now: Date, mode: OfferSendMode): Promise<string[]> {
    const candidates = [...toPush].filter(([, offers]) => offers.length > 0).map(([goalkeeperId]) => goalkeeperId);
    if (mode !== 'round') {
      await this.deps.pushState.markPushed(candidates, now);
      return candidates;
    }
    const claimed: string[] = [];
    for (const goalkeeperId of candidates) {
      if (await this.deps.pushState.tryClaim(goalkeeperId, now, this.deps.intervalMinutes)) claimed.push(goalkeeperId);
    }
    return claimed;
  }

  /** One push per goalkeeper; goalkeepers who get the identical message share one send. */
  private async push(
    recipients: readonly string[],
    toPush: ReadonlyMap<string, PendingOffer[]>,
    context: BookingItemContext,
    report: OfferSendReport,
  ): Promise<void> {
    const groups = new Map<string, { message: PushMessage; userIds: string[] }>();
    for (const goalkeeperId of recipients) {
      const offers = toPush.get(goalkeeperId)!;
      const message = offers.length === 1 ? this.offerMessage(offers[0]!.booking, context) : groupedOfferMessage(offers.length);
      const key = JSON.stringify(message);
      const group = groups.get(key) ?? { message, userIds: [] };
      group.userIds.push(goalkeeperId);
      groups.set(key, group);
    }
    const results = await runWithConcurrency([...groups.values()], SEND_GROUPS_IN_FLIGHT, (group) =>
      this.deps.pushNotifier.sendToUsers(group.userIds, group.message),
    );
    for (const result of results) {
      report.reached += result.totals.reached;
      report.removed += result.totals.removed;
      report.failed += result.totals.failed;
    }
  }

  /** A pushed offer's first push sets `notifiedAt`; any later one counts a reminder (FR-013). */
  private async record(recipients: readonly string[], toPush: ReadonlyMap<string, PendingOffer[]>, now: Date): Promise<void> {
    const offers = recipients.flatMap((goalkeeperId) => toPush.get(goalkeeperId)!);
    await this.deps.notifications.markNotified(
      offers.filter((offer) => offer.first).map((offer) => offer.offerId),
      now,
    );
    await this.deps.notifications.markReminded(
      offers.filter((offer) => !offer.first).map((offer) => offer.offerId),
      now,
    );
  }

  private offerMessage(booking: Booking, context: BookingItemContext): PushMessage {
    const request = context.requests.get(booking.requestId);
    if (!request) throw new Error(`Booking ${booking.id} references missing request ${booking.requestId}`);
    const { match } = request;
    return singleOfferMessage({
      zoneName: context.zoneNames.get(match.zoneId) ?? null,
      cityName: context.cityNames.get(match.cityId) ?? null,
      startsAt: match.startsAt,
      timeZone: match.timeZone,
      durationMinutes: match.durationMinutes,
      requestId: booking.requestId,
      bookingId: booking.id,
    });
  }
}

/** One booking per request: the earliest created, so the offer always opens the same one. */
function representativeByRequest(bookings: readonly Booking[]): Map<string, Booking> {
  const byRequest = new Map<string, Booking>();
  for (const booking of bookings) {
    const current = byRequest.get(booking.requestId);
    if (!current || booking.createdAt < current.createdAt || (+booking.createdAt === +current.createdAt && booking.id < current.id)) {
      byRequest.set(booking.requestId, booking);
    }
  }
  return byRequest;
}

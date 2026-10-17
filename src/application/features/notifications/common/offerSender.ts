import type { Booking } from '../../../../domain/bookings/booking.js';
import type { PushMessage } from '../../../../domain/devices/deviceRules.js';
import { groupedOfferMessage, singleOfferMessage } from '../../../../domain/notifications/offerMessages.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type { IPushNotifier } from '../../devices/common/ports.js';
import { runWithConcurrency } from '../../devices/common/runWithConcurrency.js';
import { createCountrySettingsResolver } from '../../bookingLifecycle/common/countrySettingsResolver.js';
import { loadBookingItemContext, type BookingItemContext } from '../../goalkeeperRequests/common/goalkeeperBookingResponse.js';
import type { IBookingSettingsRepository, IGoalkeeperRequestRepository } from '../../goalkeeperRequests/common/ports.js';
import type { IMarketRepository } from '../../markets/common/ports.js';
import { resolveLanguage, type Language } from '../../../../domain/i18n/language.js';
import type { IUserLanguages } from '../../users/common/userLanguages.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import { resolveOfferReminders, type OfferReminderValues } from './offerReminders.js';
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
  marketRepository: IMarketRepository;
  bookingSettingsRepository: IBookingSettingsRepository;
  logger: IOffersLogger;
  /** The language each goalkeeper chose (feature 032): read once per send. */
  userLanguages: IUserLanguages;
  /** The environment values, used where neither the market nor its country sets one (spec 031). */
  platformReminders: OfferReminderValues;
}

/** The reminder values of a market, read once per send. */
type ReminderLookup = (marketId: string) => Promise<OfferReminderValues>;

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
      const reminders = this.reminderLookup();
      const languages = await this.deps.userLanguages.languagesOf([...byGoalkeeper.keys()]);
      const languageOf = (goalkeeperId: string): Language => resolveLanguage(languages.get(goalkeeperId), null);
      const toPush = new Map<string, PendingOffer[]>();

      for (const [goalkeeperId, bookings] of byGoalkeeper) {
        const representatives = representativeByRequest(bookings);
        const inserted: PendingOffer[] = [];
        for (const booking of representatives.values()) {
          const message = this.offerMessage(booking, context, languageOf(goalkeeperId));
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
        toPush.set(goalkeeperId, mode === 'round' ? await this.openOffers(goalkeeperId, representatives, context, reminders) : inserted);
      }

      const recipients = await this.claim(toPush, now, mode, context, reminders);
      report.pushed = recipients.length;
      await this.push(recipients, toPush, context, languageOf, report);
      await this.record(recipients, toPush, now);
      return report;
    } catch (err) {
      this.deps.logger.warn({ outcome: 'offer_send_failed', mode, err }, 'Sending offers failed');
      return report;
    }
  }

  /** Each market's values: its own, else its country's, else the platform's (research §6). */
  private reminderLookup(): ReminderLookup {
    const settings = createCountrySettingsResolver(this.deps);
    return async (marketId) => {
      const { settings: country, marketSettings: market } = await settings(marketId);
      const resolved = resolveOfferReminders({ market, country }, this.deps.platformReminders);
      return { maxReminders: resolved.maxReminders.value!, intervalMinutes: resolved.intervalMinutes.value! };
    };
  }

  private marketOf(requestId: string, context: BookingItemContext): string | null {
    return context.requests.get(requestId)?.match.marketId ?? null;
  }

  private async valuesFor(requestId: string, context: BookingItemContext, reminders: ReminderLookup): Promise<OfferReminderValues> {
    const marketId = this.marketOf(requestId, context);
    return marketId ? reminders(marketId) : this.deps.platformReminders;
  }

  /**
   * In a round: the goalkeeper's offers for these requests that were not opened, dismissed, deleted
   * or reminded the maximum of the request's market.
   */
  private async openOffers(
    goalkeeperId: string,
    representatives: ReadonlyMap<string, Booking>,
    context: BookingItemContext,
    reminders: ReminderLookup,
  ): Promise<PendingOffer[]> {
    const offers = await this.deps.notifications.findOffers([goalkeeperId], [...representatives.keys()]);
    const open: typeof offers = [];
    for (const offer of offers) {
      if (offer.readAt !== null || offer.dismissedAt !== null || offer.deletedAt !== null) continue;
      if (offer.notifiedAt !== null && offer.reminderCount >= (await this.valuesFor(offer.requestId!, context, reminders)).maxReminders) continue;
      open.push(offer);
    }
    return open
      .map((offer) => ({
        offerId: offer.id,
        requestId: offer.requestId!,
        booking: representatives.get(offer.requestId!)!,
        first: offer.notifiedAt === null,
      }));
  }

  /**
   * Who gets a push now: everyone with something to push, but in a round only after winning the
   * claim, whose interval is the shortest among the markets of the goalkeeper's offers.
   */
  private async claim(
    toPush: ReadonlyMap<string, PendingOffer[]>,
    now: Date,
    mode: OfferSendMode,
    context: BookingItemContext,
    reminders: ReminderLookup,
  ): Promise<string[]> {
    const candidates = [...toPush].filter(([, offers]) => offers.length > 0).map(([goalkeeperId]) => goalkeeperId);
    if (mode !== 'round') {
      await this.deps.pushState.markPushed(candidates, now);
      return candidates;
    }
    const claimed: string[] = [];
    for (const goalkeeperId of candidates) {
      const intervals = await Promise.all(toPush.get(goalkeeperId)!.map(async (offer) => (await this.valuesFor(offer.requestId, context, reminders)).intervalMinutes));
      if (await this.deps.pushState.tryClaim(goalkeeperId, now, Math.min(...intervals))) claimed.push(goalkeeperId);
    }
    return claimed;
  }

  /** One push per goalkeeper, in their language; goalkeepers who get the identical message share one send. */
  private async push(
    recipients: readonly string[],
    toPush: ReadonlyMap<string, PendingOffer[]>,
    context: BookingItemContext,
    languageOf: (goalkeeperId: string) => Language,
    report: OfferSendReport,
  ): Promise<void> {
    const groups = new Map<string, { message: PushMessage; userIds: string[] }>();
    for (const goalkeeperId of recipients) {
      const offers = toPush.get(goalkeeperId)!;
      const language = languageOf(goalkeeperId);
      const message = offers.length === 1 ? this.offerMessage(offers[0]!.booking, context, language) : groupedOfferMessage(language, offers.length);
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

  private offerMessage(booking: Booking, context: BookingItemContext, language: Language): PushMessage {
    const request = context.requests.get(booking.requestId);
    if (!request) throw new Error(`Booking ${booking.id} references missing request ${booking.requestId}`);
    const { match } = request;
    return singleOfferMessage(language, {
      zoneName: context.zoneNames.get(match.zoneId) ?? null,
      marketName: context.marketNames.get(match.marketId) ?? null,
      startsAt: match.startsAt,
      timeZone: match.timeZone,
      durationMinutes: match.durationMinutes,
      format: match.format,
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

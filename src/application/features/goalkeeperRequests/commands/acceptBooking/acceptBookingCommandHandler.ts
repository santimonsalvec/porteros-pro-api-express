import { validate as isUuid } from 'uuid';
import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator, IUserRepository } from '../../../auth/common/ports.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import {
  resolveGoalkeeperWalletContext,
  type GoalkeeperWalletContextDependencies,
} from '../../../wallet/common/goalkeeperWalletContext.js';
import type { IWalletRepository } from '../../../wallet/common/ports.js';
import { commissionChargeDraft, commissionVatDraft } from '../../../wallet/common/walletLedger.js';
import { commissionCharged } from '../../../../../domain/events/billingEvents.js';
import type { IVatRateResolver } from '../../../wallet/common/ports.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import type { IEventRelay } from '../../../events/common/ports.js';
import type { Booking } from '../../../../../domain/bookings/booking.js';
import { goalkeeperAssigned } from '../../../../../domain/events/bookingEvents.js';
import { canAfford, missingFor } from '../../../../../domain/wallet/fundsPolicy.js';
import { loadContacts } from '../../common/contacts.js';
import type { CheckInWindowResolver } from '../../../bookingLifecycle/common/checkInWindowResolver.js';
import { loadBookingItemContext, loadCheckInWindows, toAgendaItem } from '../../common/goalkeeperBookingResponse.js';
import type {
  IAcceptanceAuditLogger,
  IBookingAcceptanceStore,
  IBookingRepository,
  IGoalkeeperRequestRepository,
} from '../../common/ports.js';
import { AcceptBookingCommand, type AcceptBookingResult } from './acceptBookingCommand.js';

export interface AcceptBookingDependencies {
  walletContext: GoalkeeperWalletContextDependencies;
  walletRepository: IWalletRepository;
  bookingRepository: IBookingRepository;
  requestRepository: IGoalkeeperRequestRepository;
  zoneRepository: IZoneRepository;
  cityRepository: ICityRepository;
  userRepository: IUserRepository;
  store: IBookingAcceptanceStore;
  idGenerator: IIdGenerator;
  clock: IClock;
  audit: IAcceptanceAuditLogger;
  /** The check-in window of the match's country (feature 020), for the agenda item returned. */
  windowResolver: () => CheckInWindowResolver;
  /** Publishes the recorded "goalkeeper assigned" event before responding (feature 013). */
  relay: IEventRelay;
  /** The goalkeeper's country VAT rate, charged on top of the commission (feature 023). */
  vatRates: IVatRateResolver;
}

/**
 * Checks everything it can up front to give a precise reason (FR-005), then hands the atomic part —
 * claim, commitments, charge — to the store. Whatever can race (still pending, funds, clashes) is
 * decided again inside the store's transaction; a claim that fails is classified afterwards.
 */
export class AcceptBookingCommandHandler implements ICommandHandler<AcceptBookingCommand, AcceptBookingResult> {
  constructor(private readonly deps: AcceptBookingDependencies) {}

  async handle(command: AcceptBookingCommand): Promise<AcceptBookingResult> {
    const { goalkeeperId, bookingId } = command;
    const now = this.deps.clock.now();
    if (!isUuid(bookingId)) return this.finish(command, { outcome: 'not_available' });

    const context = await resolveGoalkeeperWalletContext(this.deps.walletContext, goalkeeperId);
    if (context.kind === 'not_a_goalkeeper') return this.finish(command, { outcome: 'not_a_goalkeeper' });

    const booking = await this.deps.bookingRepository.findById(bookingId);
    if (!booking) return this.finish(command, { outcome: 'not_available' });
    if (booking.goalkeeperId === goalkeeperId) return this.finish(command, { outcome: 'replayed', booking: await this.item(booking) }, booking);

    const profile = context.kind === 'ok' ? context.profile : await this.deps.walletContext.goalkeeperProfileRepository.getByUserId(goalkeeperId);
    // Offers switched off: the goalkeeper must be available to take matches (feature 015).
    if (profile && !profile.availableForOffers) return this.finish(command, { outcome: 'not_available_for_offers' }, booking);
    if (profile?.suspendedUntil && profile.suspendedUntil > now) {
      return this.finish(command, { outcome: 'suspended', suspendedUntil: profile.suspendedUntil.toISOString() }, booking);
    }
    if (!profile?.zoneIds.includes(booking.zoneId)) return this.finish(command, { outcome: 'zone_not_enabled' }, booking);
    const unclaimable = this.classify(booking, goalkeeperId, now);
    if (unclaimable) return this.finish(command, unclaimable, booking);
    if (context.kind === 'wallet_not_configured') return this.finish(command, { outcome: 'not_available' }, booking);

    const [wallet, vatRateBps] = await Promise.all([
      this.deps.walletRepository.findByGoalkeeperId(goalkeeperId),
      this.deps.vatRates.forCountry(context.countryId),
    ]);
    const balance = wallet?.balance ?? 0;
    if (!canAfford(balance, booking.commission, vatRateBps)) {
      return this.finish(command, { outcome: 'insufficient_funds', missingAmount: missingFor(balance, booking.commission, vatRateBps) }, booking);
    }

    const owner = { goalkeeperId, currency: context.currency, invoicing: context.invoicing };
    const result = await this.deps.store.accept({
      bookingId,
      goalkeeperId,
      now,
      chargeDrafts: (claimed) => {
        const refs = { bookingId: claimed.id, requestId: claimed.requestId };
        const commission = commissionChargeDraft(owner, { ...refs, amount: claimed.commission }, this.deps.idGenerator.newId(), now);
        const vat = commissionVatDraft(owner, { ...refs, base: claimed.commission, rateBps: vatRateBps }, this.deps.idGenerator.newId(), now);
        return vat ? [commission, vat] : [commission];
      },
      // The assignment (013) and the billable charge (023), recorded with the movements.
      events: (assigned, charged) => {
        const [commission, vat] = charged;
        return [
          goalkeeperAssigned(this.deps.idGenerator.newId(), assigned, now),
          commissionCharged(this.deps.idGenerator.newId(), { bookingId: assigned.id, requestId: assigned.requestId }, now, {
            goalkeeperId,
            movementId: commission!.id,
            vatMovementId: vat?.id ?? null,
            base: -commission!.amount,
            vat: vat ? -vat.amount : 0,
            vatRateBps: vat ? vatRateBps : 0,
            currency: commission!.currency,
          }),
        ];
      },
    });
    switch (result.kind) {
      case 'accepted':
        await this.deps.relay.relay(result.events);
        return this.finish(command, { outcome: 'accepted', booking: await this.item(result.booking) }, result.booking);
      case 'same_request':
        return this.finish(command, { outcome: 'same_request' }, booking);
      case 'schedule_conflict':
        return this.finish(command, { outcome: 'schedule_conflict', conflictingBookingId: result.conflictingBookingId }, booking);
      case 'insufficient_funds':
        return this.finish(command, { outcome: 'insufficient_funds', missingAmount: missingFor(result.balance, booking.commission, vatRateBps) }, booking);
      case 'not_claimed': {
        // A concurrent change won the race: look again to say which.
        const current = await this.deps.bookingRepository.findById(bookingId);
        if (current?.goalkeeperId === goalkeeperId) return this.finish(command, { outcome: 'replayed', booking: await this.item(current) }, current);
        return this.finish(command, (current && this.classify(current, goalkeeperId, now)) ?? { outcome: 'not_available' }, booking);
      }
    }
  }

  /** Why a booking cannot be claimed by this goalkeeper right now, or null when it can. */
  private classify(booking: Booking, goalkeeperId: string, now: Date): AcceptBookingResult | null {
    if (booking.status === 'assigned') return { outcome: 'already_taken' };
    if (booking.status !== 'pending_assignment') return { outcome: 'not_available' };
    if (booking.clientId === goalkeeperId) return { outcome: 'own_request' };
    // The replacement of a booking this goalkeeper withdrew from is never theirs (feature 018), nor
    // a match they dismissed (feature 024).
    if (booking.isClosedTo(goalkeeperId)) return { outcome: 'not_available' };
    if (!booking.isSearchOpenAt(now)) return { outcome: 'search_ended' };
    return null;
  }

  /** The booking as the goalkeeper's agenda shows it; the client's contact only in the last hour (feature 019). */
  private async item(booking: Booking) {
    const [context, contacts] = await Promise.all([
      loadBookingItemContext(this.deps, [booking]),
      loadContacts(this.deps.userRepository, [booking.clientId]),
    ]);
    const windows = await loadCheckInWindows(context, this.deps.windowResolver());
    return toAgendaItem(booking, context, contacts.get(booking.clientId) ?? null, this.deps.clock.now(), windows.get(booking.requestId));
  }

  /** Every attempt is audited exactly once, whatever its outcome (FR-015). */
  private finish(command: AcceptBookingCommand, result: AcceptBookingResult, booking?: Booking): AcceptBookingResult {
    this.deps.audit.logAcceptance({
      outcome: result.outcome,
      goalkeeperId: command.goalkeeperId,
      bookingId: command.bookingId,
      ...(booking ? { requestId: booking.requestId } : {}),
    });
    return result;
  }
}

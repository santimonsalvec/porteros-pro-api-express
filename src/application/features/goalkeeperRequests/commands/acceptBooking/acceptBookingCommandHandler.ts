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
import { commissionChargeDraft } from '../../../wallet/common/walletLedger.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import type { Booking } from '../../../../../domain/bookings/booking.js';
import { canAfford } from '../../../../../domain/wallet/fundsPolicy.js';
import { loadContacts } from '../../common/contacts.js';
import { loadBookingItemContext, toAgendaItem } from '../../common/goalkeeperBookingResponse.js';
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
    if (profile?.suspendedUntil && profile.suspendedUntil > now) {
      return this.finish(command, { outcome: 'suspended', suspendedUntil: profile.suspendedUntil.toISOString() }, booking);
    }
    if (!profile?.zoneIds.includes(booking.zoneId)) return this.finish(command, { outcome: 'zone_not_enabled' }, booking);
    const unclaimable = this.classify(booking, goalkeeperId, now);
    if (unclaimable) return this.finish(command, unclaimable, booking);
    if (context.kind === 'wallet_not_configured') return this.finish(command, { outcome: 'not_available' }, booking);

    const wallet = await this.deps.walletRepository.findByGoalkeeperId(goalkeeperId);
    const balance = wallet?.balance ?? 0;
    if (!canAfford(balance, booking.commission)) {
      return this.finish(command, { outcome: 'insufficient_funds', missingAmount: booking.commission - balance }, booking);
    }

    const owner = { goalkeeperId, currency: context.currency, invoicing: context.invoicing };
    const result = await this.deps.store.accept({
      bookingId,
      goalkeeperId,
      now,
      commissionDraft: (claimed) =>
        commissionChargeDraft(owner, { bookingId: claimed.id, requestId: claimed.requestId, amount: claimed.commission }, this.deps.idGenerator.newId(), now),
    });
    switch (result.kind) {
      case 'accepted':
        return this.finish(command, { outcome: 'accepted', booking: await this.item(result.booking) }, result.booking);
      case 'same_request':
        return this.finish(command, { outcome: 'same_request' }, booking);
      case 'schedule_conflict':
        return this.finish(command, { outcome: 'schedule_conflict', conflictingBookingId: result.conflictingBookingId }, booking);
      case 'insufficient_funds':
        return this.finish(command, { outcome: 'insufficient_funds', missingAmount: booking.commission - result.balance }, booking);
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
    if (!booking.isSearchOpenAt(now)) return { outcome: 'search_ended' };
    return null;
  }

  /** The booking as the goalkeeper's agenda shows it, with the client's contact. */
  private async item(booking: Booking) {
    const [context, contacts] = await Promise.all([
      loadBookingItemContext(this.deps, [booking]),
      loadContacts(this.deps.userRepository, [booking.clientId]),
    ]);
    return toAgendaItem(booking, context, contacts.get(booking.clientId) ?? null);
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

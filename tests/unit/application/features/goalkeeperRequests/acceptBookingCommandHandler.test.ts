import { beforeEach, describe, expect, it } from 'vitest';
import { AcceptBookingCommand } from '../../../../../src/application/features/goalkeeperRequests/commands/acceptBooking/acceptBookingCommand.js';
import { AcceptBookingCommandHandler } from '../../../../../src/application/features/goalkeeperRequests/commands/acceptBooking/acceptBookingCommandHandler.js';
import { requestStatusOf } from '../../../../../src/domain/bookings/requestStatus.js';
import { FakeAcceptanceAuditLogger } from '../../../../fakes/fakeAcceptanceAuditLogger.js';
import { FakeBookingAcceptanceStore } from '../../../../fakes/fakeBookingAcceptanceStore.js';
import { FakeOutboxStore } from '../../../../fakes/fakeOutboxStore.js';
import { FakeEventRelay } from '../../../../fakes/fakeEventRelay.js';
import { GoalkeeperBookingHarness, inHours } from './goalkeeperBookingHarness.js';

let h: GoalkeeperBookingHarness;
let store: FakeBookingAcceptanceStore;
let outbox: FakeOutboxStore;
let relay: FakeEventRelay;
let audit: FakeAcceptanceAuditLogger;
let handler: AcceptBookingCommandHandler;
let ids: number;

/** Booking and request ids must be UUIDs for the handler. */
const uuid = (n: number) => `01925c00-0000-7000-8000-${String(n).padStart(12, '0')}`;

beforeEach(async () => {
  h = new GoalkeeperBookingHarness();
  outbox = new FakeOutboxStore();
  relay = new FakeEventRelay();
  store = new FakeBookingAcceptanceStore(h.bookings, h.wallet, outbox);
  audit = new FakeAcceptanceAuditLogger();
  ids = 0;
  handler = new AcceptBookingCommandHandler({
    walletContext: { goalkeeperProfileRepository: h.profiles, cityRepository: h.cities, regionRepository: h.regions, countryLookup: h.countries },
    walletRepository: h.wallet,
    bookingRepository: h.bookings,
    requestRepository: h.requests,
    zoneRepository: h.zones,
    cityRepository: h.cities,
    userRepository: h.users,
    store,
    idGenerator: { newId: () => `move-${++ids}` },
    clock: h.clock,
    audit,
    relay,
  });
  await h.credit(20000);
});

/** A 1- or 2-goalkeeper request in Norte, `hours` from now; returns its booking ids. */
function match(n: number, hours: number, overrides: Parameters<GoalkeeperBookingHarness['seedRequest']>[2] = {}) {
  const count = overrides.goalkeeperCount ?? 1;
  const bookingIds = Array.from({ length: count }, (_, index) => uuid(n * 100 + index + 1));
  const { bookings } = h.seedRequest(uuid(n), inHours(hours), { goalkeeperCount: 1, ...overrides }, bookingIds);
  return bookings.map((booking) => booking.id);
}

const accept = (bookingId: string, goalkeeperId = 'gk-1') => handler.handle(new AcceptBookingCommand(goalkeeperId, bookingId));
const balance = async () => (await h.wallet.findByGoalkeeperId('gk-1'))?.balance ?? 0;
const charges = () => h.wallet.movements().filter((movement) => movement.type === 'commission_charge');

describe('AcceptBookingCommandHandler — US2: accepting assigns and charges, all or nothing', () => {
  it("assigns the booking and charges exactly its commission, referencing booking and request", async () => {
    const [bookingId] = match(1, 5);

    const result = await accept(bookingId!);

    expect(result).toMatchObject({
      outcome: 'accepted',
      booking: { bookingId, status: 'assigned', earnings: 60000, commission: 7000, client: { firstName: 'Ana', lastName: 'Cliente', whatsApp: '+57 300 111 2222' } },
    });
    expect(await balance()).toBe(13000);
    expect(charges().map((movement) => [movement.amount, movement.references])).toEqual([[-7000, { bookingId, requestId: uuid(1) }]]);
    expect(await h.bookings.findById(bookingId!)).toMatchObject({ status: 'assigned', goalkeeperId: 'gk-1', assignedAt: h.clock.now() });
  });

  it('answers a repeat with the same assignment and never charges twice', async () => {
    const [bookingId] = match(1, 5);
    await accept(bookingId!);

    expect(await accept(bookingId!)).toMatchObject({ outcome: 'replayed', booking: { bookingId } });
    expect(charges()).toHaveLength(1);
  });

  it('gives a booking to one goalkeeper only; the other is told it is taken and is not charged', async () => {
    const [bookingId] = match(1, 5);
    h.addGoalkeeper('gk-2');
    await h.credit(20000, 'gk-2');

    expect((await accept(bookingId!)).outcome).toBe('accepted');
    expect(await accept(bookingId!, 'gk-2')).toEqual({ outcome: 'already_taken' });
    expect(h.wallet.movements().filter((movement) => movement.walletId === 'gk-2' && movement.type === 'commission_charge')).toHaveLength(0);
  });

  it('leaves nothing behind when the operation is interrupted', async () => {
    const [bookingId] = match(1, 5);
    store.failNextWith(new Error('connection reset'));

    await expect(accept(bookingId!)).rejects.toThrow('connection reset');
    expect(charges()).toHaveLength(0);
    expect(await h.bookings.findById(bookingId!)).toMatchObject({ status: 'pending_assignment', goalkeeperId: null });
  });

  it("moves the request from searching to partially assigned to assigned", async () => {
    const [first, second] = match(1, 5, { goalkeeperCount: 2 });
    h.addGoalkeeper('gk-2');
    await h.credit(20000, 'gk-2');
    const status = async () => requestStatusOf(await h.bookings.findByRequestIds([uuid(1)]));

    expect(await status()).toBe('searching');
    await accept(first!);
    expect(await status()).toBe('partially_assigned');
    await accept(second!, 'gk-2');
    expect(await status()).toBe('assigned');
  });

  it('audits every attempt with its outcome', async () => {
    const [bookingId] = match(1, 5);
    await accept(bookingId!);
    await accept(bookingId!);
    await accept('not-a-uuid');

    expect(audit.entries).toEqual([
      { outcome: 'accepted', goalkeeperId: 'gk-1', bookingId, requestId: uuid(1) },
      { outcome: 'replayed', goalkeeperId: 'gk-1', bookingId, requestId: uuid(1) },
      { outcome: 'not_available', goalkeeperId: 'gk-1', bookingId: 'not-a-uuid' },
    ]);
  });
});

describe('AcceptBookingCommandHandler — US3: never two matches the goalkeeper cannot reach', () => {
  // A held match 5 h from now lasts 90 min: it ends at +6.5 h; with a 30-minute margin the next
  // match can start at +7 h at the earliest.
  it('refuses a match starting inside the travel margin, charging nothing, and accepts one just outside', async () => {
    const [held] = match(1, 5);
    const [clash] = match(2, 6.75);
    const [fine] = match(3, 7);
    await accept(held!);

    expect(await accept(clash!)).toEqual({ outcome: 'schedule_conflict', conflictingBookingId: held });
    expect((await accept(fine!)).outcome).toBe('accepted');
    expect(charges()).toHaveLength(2);
    expect(await h.bookings.findById(clash!)).toMatchObject({ status: 'pending_assignment' });
  });

  it('refuses a match that ends inside the margin before a held one', async () => {
    const [held] = match(1, 7);
    const [before] = match(2, 5.2); // ends at +6.7 h, inside the 30 min before +7 h
    await accept(held!);

    expect(await accept(before!)).toMatchObject({ outcome: 'schedule_conflict' });
  });

  it('refuses the second booking of a request the goalkeeper already holds', async () => {
    const [first, second] = match(1, 5, { goalkeeperCount: 2 });
    await accept(first!);

    expect(await accept(second!)).toEqual({ outcome: 'same_request' });
  });

  it('lets exactly one of two clashing acceptances through when they race', async () => {
    const [a] = match(1, 5);
    const [b] = match(2, 5.5);
    // Both pass the pre-checks; the store decides atomically, in order.
    const results = await Promise.all([accept(a!), accept(b!)]);

    expect(results.map((result) => result.outcome).sort()).toEqual(['accepted', 'schedule_conflict']);
    expect(charges()).toHaveLength(1);
  });
});

describe('AcceptBookingCommandHandler — US4: clear refusals that change nothing', () => {
  const unchanged = async (bookingId: string) => {
    expect(charges()).toHaveLength(0);
    expect(await h.bookings.findById(bookingId)).toMatchObject({ status: 'pending_assignment', goalkeeperId: null });
  };

  it('refuses at the end of the search (start − 30 min)', async () => {
    const [bookingId] = match(1, 0.5);

    expect(await accept(bookingId!)).toEqual({ outcome: 'search_ended' });
    await unchanged(bookingId!);
  });

  it('refuses a booking outside the enabled zones', async () => {
    const [bookingId] = match(1, 5, { zoneId: 'zone-cali-centro' });

    expect(await accept(bookingId!)).toEqual({ outcome: 'zone_not_enabled' });
    await unchanged(bookingId!);
  });

  it('refuses when the balance does not cover the commission, saying how much is missing', async () => {
    const [bookingId] = match(1, 5, { zoneId: 'zone-cali-sur' }); // 9.000
    await h.ledger.adjust(h.owner(), { adminUserId: 'admin-1', amount: -15000, reason: 'Corrección', operationKey: 'k-down' });

    expect(await accept(bookingId!)).toEqual({ outcome: 'insufficient_funds', missingAmount: 4000 });
    expect(await h.bookings.findById(bookingId!)).toMatchObject({ status: 'pending_assignment' });
  });

  it('refuses while suspended, saying until when', async () => {
    const [bookingId] = match(1, 5);
    const until = inHours(72);
    h.profiles.seed(Object.assign((await h.profiles.getByUserId('gk-1'))!, { suspendedUntil: until }));

    expect(await accept(bookingId!)).toEqual({ outcome: 'suspended', suspendedUntil: until.toISOString() });
    await unchanged(bookingId!);
  });

  it('refuses while offers are switched off, charging nothing, but still answers a repeat (feature 015)', async () => {
    const [taken] = match(1, 5);
    const [other] = match(2, 9);
    expect(await accept(taken!)).toMatchObject({ outcome: 'accepted' });
    await h.profiles.setAvailableForOffers('gk-1', false);

    expect(await accept(taken!)).toMatchObject({ outcome: 'replayed' });
    expect(await accept(other!)).toEqual({ outcome: 'not_available_for_offers' });
    expect(await h.bookings.findById(other!)).toMatchObject({ status: 'pending_assignment' });
    expect(charges()).toHaveLength(1);
  });

  it("refuses a booking of the goalkeeper's own request", async () => {
    const [bookingId] = match(1, 5, { clientId: 'gk-1' });

    expect(await accept(bookingId!)).toEqual({ outcome: 'own_request' });
    await unchanged(bookingId!);
  });

  it('answers not_available for an unknown, malformed or cancelled booking', async () => {
    const [bookingId] = match(1, 5);
    const cancelled = (await h.bookings.findById(bookingId!))!;
    h.bookings.seed(Object.assign(Object.create(Object.getPrototypeOf(cancelled)), cancelled, { status: 'cancelled' }));

    expect(await accept(uuid(999))).toEqual({ outcome: 'not_available' });
    expect(await accept('not-a-uuid')).toEqual({ outcome: 'not_available' });
    expect(await accept(bookingId!)).toEqual({ outcome: 'not_available' });
    expect(charges()).toHaveLength(0);
  });

  it('refuses a user who is not an active goalkeeper before anything else', async () => {
    const [bookingId] = match(1, 5);

    expect(await accept(bookingId!, 'someone')).toEqual({ outcome: 'not_a_goalkeeper' });
  });
});

describe('AcceptBookingCommandHandler — 013 US1: an acceptance records its event', () => {
  const events = () => outbox.all().map((entry) => entry.event);

  it('records one goalkeeper.assigned with the goalkeeper and the commission charged', async () => {
    const [bookingId] = match(1, 5);

    await accept(bookingId!);

    expect(events()).toEqual([
      expect.objectContaining({
        type: 'goalkeeper.assigned',
        bookingId,
        requestId: uuid(1),
        occurredAt: h.clock.now(),
        payload: expect.objectContaining({ goalkeeperId: 'gk-1', clientId: 'client-a', commission: 7000 }),
      }),
    ]);
  });

  it('records nothing on a repeat or a refusal', async () => {
    const [bookingId] = match(1, 5);
    await accept(bookingId!);
    h.addGoalkeeper('gk-2');
    await h.credit(20000, 'gk-2');
    const [clash] = match(2, 5.5);

    await accept(bookingId!); // replay
    await accept(bookingId!, 'gk-2'); // taken
    await accept(clash!); // schedule conflict

    expect(events()).toHaveLength(1);
    // 013 US2: only the successful acceptance was relayed.
    expect(relay.calls.map((batch) => batch.map((event) => event.type))).toEqual([['goalkeeper.assigned']]);
  });
});

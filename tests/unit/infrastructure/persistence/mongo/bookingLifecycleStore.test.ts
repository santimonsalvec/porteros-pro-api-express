import { describe, expect, it, vi } from 'vitest';
import type { ClientSession, Collection, Db, Document } from 'mongodb';
import { bookingCancelled, bookingCreated, bookingExpired, goalkeeperCheckedIn, goalkeeperWithdrew } from '../../../../../src/domain/events/bookingEvents.js';
import { DEFAULT_GOALKEEPER_PENALTIES } from '../../../../../src/domain/goalkeepers/penaltyPolicy.js';
import { MongoBookingLifecycleStore } from '../../../../../src/infrastructure/persistence/mongo/bookingLifecycleStore.js';
import { bookingToDocument } from '../../../../../src/infrastructure/persistence/mongo/bookingRepository.js';
import { requestToDocument } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperRequestRepository.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';
import { buildRequest, buildRequestBookings } from '../../../../fixtures/quoteFixtures.js';
import { COLOMBIA_INVOICING } from '../../../../fixtures/walletFixtures.js';

const now = new Date('2026-09-28T19:31:00.000Z');
const request = buildRequest('r-1', new Date('2026-09-28T20:00:00.000Z'), { goalkeeperCount: 2 });
const [first, second] = buildRequestBookings(request);
const pendingDoc = bookingToDocument(first!);
const assignedDoc = bookingToDocument(second!.assign('gk-1', new Date('2026-09-28T15:00:00.000Z')));
const owner = { goalkeeperId: 'gk-1', currency: 'COP', invoicing: COLOMBIA_INVOICING };

function harness() {
  const bookings = createFakeCollection();
  const requests = createFakeCollection();
  const wallets = createFakeCollection();
  const movements = createFakeCollection();
  const outbox = createFakeCollection();
  const incidents = createFakeCollection();
  const profiles = createFakeCollection();
  const collections: Record<string, unknown> = {
    bookings,
    goalkeeperRequests: requests,
    wallets,
    walletMovements: movements,
    outbox,
    goalkeeperIncidents: incidents,
    goalkeeperProfiles: profiles,
  };
  const db = { collection: (name: string) => collections[name] as Collection<Document> } as unknown as Db;
  const session = {
    withTransaction: vi.fn(async (fn: (s: ClientSession) => Promise<unknown>) => fn(session as unknown as ClientSession)),
    endSession: vi.fn(async () => undefined),
  };
  const store = new MongoBookingLifecycleStore(() => session as unknown as ClientSession, db);
  bookings.updateMany.mockResolvedValue({});
  bookings.updateOne.mockResolvedValue({});
  requests.updateOne.mockResolvedValue({});
  outbox.insertMany.mockResolvedValue({});
  wallets.updateOne.mockResolvedValue({});
  wallets.findOneAndUpdate.mockResolvedValue({ _id: 'gk-1', currency: 'COP', balance: 20000, lastSequence: 3, createdAt: now, updatedAt: now });
  movements.insertOne.mockResolvedValue({});
  let ids = 0;
  const cancelAll = () =>
    store.cancelAll({
      requestId: 'r-1',
      now,
      owners: new Map([['gk-1', owner]]),
      newId: () => `m-${++ids}`,
      buildEvent: (booking, refund) => bookingCancelled(`ev-${booking.id}`, booking, now, refund),
    });
  incidents.insertOne.mockResolvedValue({});
  incidents.replaceOne.mockResolvedValue({});
  incidents.countDocuments.mockResolvedValue(0);
  profiles.updateOne.mockResolvedValue({});
  return { bookings, requests, movements, outbox, incidents, profiles, session, store, cancelAll };
}

describe('MongoBookingLifecycleStore (mocked driver)', () => {
  describe('expire', () => {
    it("expires the request's due pending bookings, records their events, and deactivates a request left with nothing", async () => {
      const { bookings, requests, outbox, session, store } = harness();
      bookings.find.mockReturnValue(toArrayResult([pendingDoc]));
      bookings.countDocuments.mockResolvedValue(0);

      const result = await store.expire('r-1', now, (expired) => expired.map((booking) => bookingExpired(`ev-${booking.id}`, booking, now)));

      expect(bookings.find).toHaveBeenCalledWith({ requestId: 'r-1', status: 'pending_assignment', searchEndsAt: { $lte: now } }, { session });
      expect(bookings.updateMany).toHaveBeenCalledWith(
        { _id: { $in: [first!.id] }, status: 'pending_assignment' },
        { $set: { status: 'expired', endedAt: now, endReason: 'search_ended' } },
        { session },
      );
      expect(result.expired.map((booking) => [booking.id, booking.status])).toEqual([[first!.id, 'expired']]);
      expect(outbox.insertMany.mock.calls[0]![0]).toMatchObject([{ type: 'booking.expired', bookingId: first!.id }]);
      expect(bookings.countDocuments).toHaveBeenCalledWith({ requestId: 'r-1', status: { $in: ['pending_assignment', 'assigned'] } }, { session });
      expect(requests.updateOne).toHaveBeenCalledWith({ _id: 'r-1' }, { $set: { active: false } }, { session });
      expect(result.deactivated).toBe(true);
    });

    it('keeps the request active while another booking is assigned', async () => {
      const { bookings, requests, store } = harness();
      bookings.find.mockReturnValue(toArrayResult([pendingDoc]));
      bookings.countDocuments.mockResolvedValue(1);

      expect((await store.expire('r-1', now, () => [])).deactivated).toBe(false);
      expect(requests.updateOne).not.toHaveBeenCalled();
    });

    it('does nothing when no booking is due any more (another sweep did it)', async () => {
      const { bookings, outbox, store } = harness();
      bookings.find.mockReturnValue(toArrayResult([]));

      expect(await store.expire('r-1', now, () => [])).toEqual({ expired: [], events: [], deactivated: false });
      expect(bookings.updateMany).not.toHaveBeenCalled();
      expect(outbox.insertMany).not.toHaveBeenCalled();
    });
  });

  describe('cancelAll', () => {
    it('passes the evaluation gate once', async () => {
      const { requests, session, cancelAll } = harness();
      requests.findOneAndUpdate.mockResolvedValue(null);

      expect(await cancelAll()).toEqual({ kind: 'already_evaluated' });
      expect(requests.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'r-1', cancelAllEvaluatedAt: null },
        { $set: { cancelAllEvaluatedAt: now } },
        { session },
      );
    });

    it('keeps a request whose bookings are all assigned', async () => {
      const { bookings, requests, outbox, cancelAll } = harness();
      requests.findOneAndUpdate.mockResolvedValue({ _id: 'r-1' });
      bookings.find.mockReturnValue(toArrayResult([assignedDoc, { ...assignedDoc, _id: 'other' }]));

      expect(await cancelAll()).toEqual({ kind: 'kept' });
      expect(bookings.updateOne).not.toHaveBeenCalled();
      expect(outbox.insertMany).not.toHaveBeenCalled();
    });

    it('cancels every live booking, refunds the charged commission once, records events and deactivates', async () => {
      const { bookings, requests, movements, outbox, session, cancelAll } = harness();
      requests.findOneAndUpdate.mockResolvedValue({ _id: 'r-1' });
      bookings.find.mockReturnValue(toArrayResult([pendingDoc, assignedDoc]));
      bookings.countDocuments.mockResolvedValue(0);
      movements.findOne
        .mockResolvedValueOnce({ causeKey: `commission:${second!.id}`, amount: -7000, currency: 'COP' })
        .mockResolvedValueOnce(null);

      const result = await cancelAll();

      expect(result).toMatchObject({ kind: 'cancelled', refunds: 1 });
      expect(bookings.updateOne).toHaveBeenCalledWith(
        { _id: first!.id, status: 'pending_assignment' },
        { $set: { status: 'cancelled', endedAt: now, endReason: 'cancel_all', cancelledBy: 'system' } },
        { session },
      );
      expect(bookings.updateOne).toHaveBeenCalledWith(
        { _id: second!.id, status: 'assigned' },
        { $set: { status: 'cancelled', endedAt: now, endReason: 'cancel_all', cancelledBy: 'system' } },
        { session },
      );
      expect(movements.insertOne.mock.calls[0]![0]).toMatchObject({
        type: 'commission_refund',
        amount: 7000,
        causeKey: `commission_refund:${second!.id}`,
        cancellation: { by: 'system', at: now, reason: 'cancel_all' },
      });
      expect(outbox.insertMany.mock.calls[0]![0]).toMatchObject([
        { type: 'booking.cancelled', payload: { goalkeeperId: null, refundedAmount: null } },
        { type: 'booking.cancelled', payload: { goalkeeperId: 'gk-1', refundedAmount: 7000 } },
      ]);
      expect(requests.updateOne).toHaveBeenCalledWith({ _id: 'r-1' }, { $set: { active: false } }, { session });
      expect(result.kind === 'cancelled' && result.cancelled.map((booking) => booking.status)).toEqual(['cancelled', 'cancelled']);
    });

    it('never refunds twice: an existing refund is reused', async () => {
      const { bookings, requests, movements, cancelAll } = harness();
      requests.findOneAndUpdate.mockResolvedValue({ _id: 'r-1' });
      bookings.find.mockReturnValue(toArrayResult([pendingDoc, assignedDoc]));
      bookings.countDocuments.mockResolvedValue(0);
      movements.findOne
        .mockResolvedValueOnce({ amount: -7000, currency: 'COP' })
        .mockResolvedValueOnce({ amount: 7000, currency: 'COP' });

      expect(await cancelAll()).toMatchObject({ kind: 'cancelled', refunds: 1 });
      expect(movements.insertOne).not.toHaveBeenCalled();
    });

    it('aborts without changes when an assigned booking has no charge to refund', async () => {
      const { bookings, requests, movements, cancelAll } = harness();
      requests.findOneAndUpdate.mockResolvedValue({ _id: 'r-1' });
      bookings.find.mockReturnValue(toArrayResult([assignedDoc, pendingDoc]));
      movements.findOne.mockResolvedValue(null);

      expect(await cancelAll()).toEqual({ kind: 'missing_charge', bookingId: second!.id });
    });
  });

  describe('cancelByClient (feature 017)', () => {
    const early = new Date('2026-09-28T18:00:00.000Z'); // the free-cancellation period ends 19:00Z
    const cancelByClient = (h: ReturnType<typeof harness>, bookingId: string | null, at = early, owners = new Map([['gk-1', owner]])) =>
      h.store.cancelByClient({
        requestId: 'r-1',
        clientId: 'client-a',
        bookingId,
        now: at,
        note: 'Un amigo cubre el arco',
        owners,
        newId: () => 'm-1',
        buildEvent: (booking, refund) => bookingCancelled(`ev-${booking.id}`, booking, at, refund, { reason: 'client_cancelled', by: 'client' }),
      });

    it("cancels a pending booking of the client's request, with no refund", async () => {
      const h = harness();
      h.requests.findOne.mockResolvedValue(requestToDocument(request));
      h.bookings.find.mockReturnValue(toArrayResult([pendingDoc, assignedDoc]));
      h.bookings.countDocuments.mockResolvedValue(1);

      const result = await cancelByClient(h, first!.id);

      expect(h.requests.findOne).toHaveBeenCalledWith({ _id: 'r-1', clientId: 'client-a' }, { session: h.session });
      expect(h.bookings.updateOne).toHaveBeenCalledWith(
        { _id: first!.id, status: 'pending_assignment' },
        {
          $set: {
            status: 'cancelled',
            endedAt: early,
            endReason: 'client_cancelled',
            cancelledBy: 'client',
            cancellationNote: 'Un amigo cubre el arco',
          },
        },
        { session: h.session },
      );
      expect(h.movements.insertOne).not.toHaveBeenCalled();
      expect(result).toMatchObject({ kind: 'cancelled', refunds: 0 });
    });

    it('refunds an assigned booking cancelled in time, naming the client', async () => {
      const h = harness();
      h.requests.findOne.mockResolvedValue(requestToDocument(request));
      h.bookings.find.mockReturnValue(toArrayResult([pendingDoc, assignedDoc]));
      h.bookings.countDocuments.mockResolvedValue(1);
      h.movements.findOne.mockResolvedValueOnce({ amount: -7000, currency: 'COP' }).mockResolvedValueOnce(null);

      expect(await cancelByClient(h, second!.id)).toMatchObject({ kind: 'cancelled', refunds: 1 });
      expect(h.movements.insertOne.mock.calls[0]![0]).toMatchObject({
        type: 'commission_refund',
        amount: 7000,
        causeKey: `commission_refund:${second!.id}`,
        cancellation: { by: 'client', at: early, reason: 'Un amigo cubre el arco' },
      });
    });

    it('refuses the whole request, writing nothing, when an assigned booking is past its deadline', async () => {
      const h = harness();
      h.requests.findOne.mockResolvedValue(requestToDocument(request));
      h.bookings.find.mockReturnValue(toArrayResult([pendingDoc, assignedDoc]));

      const result = await cancelByClient(h, null, new Date('2026-09-28T19:00:01.000Z'));

      expect(result).toEqual({ kind: 'window_closed', bookingId: second!.id, freeCancellationUntil: new Date('2026-09-28T19:00:00.000Z') });
      expect(h.bookings.updateOne).not.toHaveBeenCalled();
      expect(h.outbox.insertMany).not.toHaveBeenCalled();
    });

    it('asks for the owner of a goalkeeper assigned since the caller looked', async () => {
      const h = harness();
      h.requests.findOne.mockResolvedValue(requestToDocument(request));
      h.bookings.find.mockReturnValue(toArrayResult([assignedDoc]));

      expect(await cancelByClient(h, second!.id, early, new Map())).toEqual({ kind: 'owner_required', goalkeeperId: 'gk-1' });
      expect(h.bookings.updateOne).not.toHaveBeenCalled();
    });

    it("answers not found for another client's request or an unknown booking, replayed and already final otherwise", async () => {
      const h = harness();
      h.requests.findOne.mockResolvedValueOnce(null);
      expect(await cancelByClient(h, first!.id)).toEqual({ kind: 'not_found', what: 'request' });

      h.requests.findOne.mockResolvedValue(requestToDocument(request));
      h.bookings.find.mockReturnValue(
        toArrayResult([
          { ...pendingDoc, status: 'cancelled', cancelledBy: 'client' },
          { ...assignedDoc, status: 'expired' },
        ]),
      );
      expect(await cancelByClient(h, 'unknown')).toEqual({ kind: 'not_found', what: 'booking' });
      expect(await cancelByClient(h, first!.id)).toEqual({ kind: 'replayed' });
      expect(await cancelByClient(h, second!.id)).toEqual({ kind: 'already_final', status: 'expired' });
      expect(await cancelByClient(h, null)).toEqual({ kind: 'replayed' });
      expect(h.bookings.updateOne).not.toHaveBeenCalled();
    });
  });

  it('"cancel all" ignores bookings the client cancelled (feature 017)', async () => {
    const h = harness();
    h.requests.findOneAndUpdate.mockResolvedValue({ _id: 'r-1' });
    h.bookings.find.mockReturnValue(toArrayResult([{ ...pendingDoc, status: 'cancelled', cancelledBy: 'client' }, assignedDoc]));

    expect(await h.cancelAll()).toEqual({ kind: 'kept' });
    expect(h.bookings.updateOne).not.toHaveBeenCalled();
  });

  it('"cancel all" ignores bookings a goalkeeper withdrew from (feature 018)', async () => {
    const h = harness();
    h.requests.findOneAndUpdate.mockResolvedValue({ _id: 'r-1' });
    h.bookings.find.mockReturnValue(toArrayResult([{ ...assignedDoc, _id: 'gone', status: 'goalkeeper_withdrew' }, assignedDoc]));

    expect(await h.cancelAll()).toEqual({ kind: 'kept' });
  });

  describe('withdraw (feature 018)', () => {
    // The match starts at 20:00Z; its search ends at 19:30Z.
    const at = new Date('2026-09-28T18:30:00.000Z');
    const config = DEFAULT_GOALKEEPER_PENALTIES;

    function withdraw(h: ReturnType<typeof harness>, when = at) {
      let ids = 0;
      return h.store.withdraw({
        bookingId: second!.id,
        goalkeeperId: 'gk-1',
        now: when,
        note: 'Me enfermé',
        config,
        newId: () => `id-${++ids}`,
        buildEvents: (withdrawn, incident, replacement, suspendedUntil) => [
          goalkeeperWithdrew('ev-w', withdrawn, incident, suspendedUntil, when),
          ...(replacement ? [bookingCreated('ev-c', replacement, request, when)] : []),
        ],
      });
    }

    it('ends the booking, creates the replacement, penalizes a late withdrawal and suspends the goalkeeper', async () => {
      const h = harness();
      h.bookings.findOne.mockResolvedValue(assignedDoc);
      h.bookings.countDocuments.mockResolvedValue(1);
      h.incidents.countDocuments.mockResolvedValue(0);
      h.incidents.find.mockImplementation(() => toArrayResult(h.incidents.insertOne.mock.calls.map((call) => call[0])));

      const result = await withdraw(h);

      expect(h.bookings.updateOne).toHaveBeenCalledWith(
        { _id: second!.id, status: 'assigned', goalkeeperId: 'gk-1' },
        {
          $set: {
            status: 'goalkeeper_withdrew',
            endedAt: at,
            endReason: 'goalkeeper_withdrew',
            cancelledBy: 'goalkeeper',
            cancellationNote: 'Me enfermé',
          },
        },
        { session: h.session },
      );
      expect(h.bookings.insertOne.mock.calls[0]![0]).toMatchObject({
        _id: 'id-1',
        requestId: 'r-1',
        status: 'pending_assignment',
        replacesBookingId: second!.id,
        excludedGoalkeeperIds: ['gk-1'],
        commission: second!.commission,
        searchEndsAt: second!.searchEndsAt,
      });
      expect(h.incidents.countDocuments).toHaveBeenCalledWith(
        { goalkeeperId: 'gk-1', forgivenAt: null, occurredAt: { $gt: new Date('2026-09-21T18:30:00.000Z') } },
        { session: h.session },
      );
      const until = new Date('2026-10-01T18:30:00.000Z');
      expect(h.incidents.insertOne.mock.calls[0]![0]).toMatchObject({
        kind: 'withdrawal',
        goalkeeperId: 'gk-1',
        bookingId: second!.id,
        noticeMinutes: 90,
        late: true,
        reason: 'Me enfermé',
        replacementBookingId: 'id-1',
        penalties: [{ kind: 'late', days: 3, startsAt: at, endsAt: until, reversal: null }],
        forgivenAt: null,
      });
      expect(h.incidents.find).toHaveBeenCalledWith({ goalkeeperId: 'gk-1', 'penalties.endsAt': { $gt: at } }, { session: h.session });
      expect(h.profiles.updateOne).toHaveBeenCalledWith(
        { userId: 'gk-1' },
        { $set: { suspendedUntil: until, penaltiesUpdatedAt: at } },
        { session: h.session },
      );
      expect(h.outbox.insertMany.mock.calls[0]![0].map((entry: { type: string }) => entry.type)).toEqual(['goalkeeper.withdrew', 'booking.created']);
      expect(result).toMatchObject({ kind: 'withdrawn', suspendedUntil: until, booking: { status: 'goalkeeper_withdrew' }, replacement: { id: 'id-1' } });
    });

    it('creates no replacement once the search is over, and always writes the profile', async () => {
      const h = harness();
      h.bookings.findOne.mockResolvedValue(assignedDoc);
      h.bookings.countDocuments.mockResolvedValue(0);
      h.incidents.find.mockReturnValue(toArrayResult([]));

      const result = await withdraw(h, new Date('2026-09-28T19:40:00.000Z'));

      expect(h.bookings.insertOne).not.toHaveBeenCalled();
      expect(h.incidents.insertOne.mock.calls[0]![0]).toMatchObject({ replacementBookingId: null, late: true });
      expect(h.profiles.updateOne).toHaveBeenCalled();
      expect(h.requests.updateOne).toHaveBeenCalledWith({ _id: 'r-1' }, { $set: { active: false } }, { session: h.session });
      expect(result).toMatchObject({ kind: 'withdrawn', replacement: null });
    });

    it('adds the weekly-limit penalty to the one reaching the limit', async () => {
      const h = harness();
      h.bookings.findOne.mockResolvedValue(assignedDoc);
      h.bookings.countDocuments.mockResolvedValue(1);
      h.incidents.countDocuments.mockResolvedValue(2);
      h.incidents.find.mockReturnValue(toArrayResult([]));

      await withdraw(h, new Date('2026-09-28T15:00:00.000Z'));

      expect(h.incidents.insertOne.mock.calls[0]![0].penalties.map((p: { kind: string }) => p.kind)).toEqual(['weekly_limit']);
    });

    it.each([
      ['another goalkeeper', { ...assignedDoc, goalkeeperId: 'gk-2' }, { kind: 'not_found' }],
      ['a missing booking', null, { kind: 'not_found' }],
      ['a pending booking', { ...assignedDoc, status: 'cancelled' }, { kind: 'not_withdrawable', status: 'cancelled' }],
    ])('refuses %s without writing', async (_label, doc, expected) => {
      const h = harness();
      h.bookings.findOne.mockResolvedValue(doc);

      expect(await withdraw(h)).toEqual(expected);
      expect(h.bookings.updateOne).not.toHaveBeenCalled();
      expect(h.incidents.insertOne).not.toHaveBeenCalled();
      expect(h.profiles.updateOne).not.toHaveBeenCalled();
    });

    it('refuses once the match has started', async () => {
      const h = harness();
      h.bookings.findOne.mockResolvedValue(assignedDoc);

      expect(await withdraw(h, new Date('2026-09-28T20:00:00.000Z'))).toEqual({ kind: 'match_started', startsAt: second!.startsAt });
      expect(h.bookings.updateOne).not.toHaveBeenCalled();
    });

    it('answers a repeat from the stored withdrawal, without writing', async () => {
      const h = harness();
      h.bookings.findOne.mockResolvedValue({ ...assignedDoc, status: 'goalkeeper_withdrew' });
      h.incidents.findOne.mockResolvedValue(storedIncident());
      h.profiles.findOne.mockResolvedValue({ userId: 'gk-1', suspendedUntil: new Date('2026-10-01T18:30:00.000Z') });

      expect(await withdraw(h)).toMatchObject({ kind: 'replayed', incident: { id: 'w-1' }, suspendedUntil: new Date('2026-10-01T18:30:00.000Z') });
      expect(h.incidents.findOne).toHaveBeenCalledWith({ kind: 'withdrawal', bookingId: second!.id }, { session: h.session });
      expect(h.bookings.updateOne).not.toHaveBeenCalled();
      expect(h.profiles.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('reverseWithdrawal (feature 018)', () => {
    const at = new Date('2026-09-29T12:00:00.000Z');

    function reverse(h: ReturnType<typeof harness>, what: { refund: boolean; liftSuspension: boolean }) {
      let ids = 0;
      return h.store.reverseWithdrawal({
        goalkeeperId: 'gk-1',
        withdrawalId: 'w-1',
        adminId: 'admin-1',
        reason: 'Incapacidad médica',
        now: at,
        owner,
        newId: () => `m-${++ids}`,
        ...what,
      });
    }

    it('refunds the commission as the admin, lifts the penalties, forgives and recomputes the suspension', async () => {
      const h = harness();
      h.incidents.findOne.mockResolvedValue(storedIncident());
      h.bookings.findOne.mockResolvedValue({ ...assignedDoc, status: 'goalkeeper_withdrew' });
      h.movements.findOne
        .mockResolvedValueOnce({ causeKey: `commission:${second!.id}`, amount: -7000, currency: 'COP' })
        .mockResolvedValueOnce(null);
      h.incidents.find.mockImplementation(() => toArrayResult(h.incidents.replaceOne.mock.calls.map((call) => call[1])));

      const result = await reverse(h, { refund: true, liftSuspension: true });

      expect(h.incidents.findOne).toHaveBeenCalledWith({ _id: 'w-1', goalkeeperId: 'gk-1' }, { session: h.session });
      expect(h.movements.insertOne.mock.calls[0]![0]).toMatchObject({
        type: 'commission_refund',
        amount: 7000,
        causeKey: `commission_refund:${second!.id}`,
        actor: { kind: 'admin', userId: 'admin-1' },
        cancellation: { by: 'admin', at, reason: 'Incapacidad médica' },
      });
      const replaced = h.incidents.replaceOne.mock.calls[0]![1];
      expect(replaced).toMatchObject({
        forgivenAt: at,
        moneyReversal: { by: 'admin-1', at, reason: 'Incapacidad médica', amount: 7000, currency: 'COP' },
        penalties: [{ reversal: { by: 'admin-1', at, reason: 'Incapacidad médica' } }],
      });
      expect(h.profiles.updateOne).toHaveBeenCalledWith(
        { userId: 'gk-1' },
        { $set: { suspendedUntil: null, penaltiesUpdatedAt: at } },
        { session: h.session },
      );
      expect(result).toMatchObject({ kind: 'reversed', suspendedUntil: null });
    });

    it('does nothing when there is nothing left to reverse', async () => {
      const h = harness();
      const decision = { by: 'admin-1', at, reason: 'x' };
      const done = storedIncident({ moneyReversal: { ...decision, amount: 7000, currency: 'COP' }, forgivenAt: at, lifted: decision });
      h.incidents.findOne.mockResolvedValue(done);
      h.profiles.findOne.mockResolvedValue({ userId: 'gk-1', suspendedUntil: null });

      expect(await reverse(h, { refund: true, liftSuspension: true })).toMatchObject({ kind: 'replayed', suspendedUntil: null });
      expect(h.movements.insertOne).not.toHaveBeenCalled();
      expect(h.incidents.replaceOne).not.toHaveBeenCalled();
      expect(h.profiles.updateOne).not.toHaveBeenCalled();
    });

    it("answers not found for another goalkeeper's withdrawal, and missing_charge without writing", async () => {
      const h = harness();
      h.incidents.findOne.mockResolvedValue(null);
      expect(await reverse(h, { refund: true, liftSuspension: false })).toEqual({ kind: 'not_found' });

      const other = harness();
      other.incidents.findOne.mockResolvedValue(storedIncident());
      other.bookings.findOne.mockResolvedValue(assignedDoc);
      other.movements.findOne.mockResolvedValue(null);
      expect(await reverse(other, { refund: true, liftSuspension: true })).toEqual({ kind: 'missing_charge', bookingId: second!.id });
      expect(other.incidents.replaceOne).not.toHaveBeenCalled();
    });
  });

  describe('checkIn (feature 020)', () => {
    // The match starts at 20:00Z; the window is 19:30Z–20:15Z.
    const window = { opensAt: new Date('2026-09-28T19:30:00.000Z'), closesAt: new Date('2026-09-28T20:15:00.000Z') };
    const photo = { imageId: 'img-1', photoUrl: 'https://img/1', location: { latitude: 3.45, longitude: -76.5, accuracyMeters: 12 }, distanceMeters: 40 };

    function checkIn(h: ReturnType<typeof harness>, when: Date) {
      return h.store.checkIn({
        bookingId: second!.id,
        goalkeeperId: 'gk-1',
        now: when,
        window,
        checkIn: photo,
        buildEvents: (booking) => [goalkeeperCheckedIn('ev-ci', booking, when)],
      });
    }

    it('records the check-in once with its event', async () => {
      const h = harness();
      h.bookings.findOne.mockResolvedValue(assignedDoc);
      const when = new Date('2026-09-28T19:50:00.000Z');

      const result = await checkIn(h, when);

      expect(h.bookings.updateOne).toHaveBeenCalledWith(
        { _id: second!.id, status: 'assigned', goalkeeperId: 'gk-1', checkIn: null },
        { $set: { checkIn: { at: when, ...photo } } },
        { session: h.session },
      );
      expect(h.outbox.insertMany.mock.calls[0]![0]).toMatchObject([{ type: 'goalkeeper.checked_in', bookingId: second!.id }]);
      expect(result).toMatchObject({ kind: 'checked_in', booking: { checkIn: { at: when, photoUrl: 'https://img/1', distanceMeters: 40 } } });
    });

    it('answers a repeat with the recorded check-in, even after the close, without writing', async () => {
      const h = harness();
      h.bookings.findOne.mockResolvedValue({ ...assignedDoc, checkIn: { at: new Date('2026-09-28T19:40:00.000Z'), ...photo } });

      expect(await checkIn(h, new Date('2026-09-28T21:00:00.000Z'))).toMatchObject({ kind: 'replayed' });
      expect(h.bookings.updateOne).not.toHaveBeenCalled();
    });

    it.each([
      ['another goalkeeper', { ...assignedDoc, goalkeeperId: 'gk-2' }, '2026-09-28T19:50:00.000Z', { kind: 'not_found' }],
      ['a booking no longer assigned', { ...assignedDoc, status: 'goalkeeper_withdrew' }, '2026-09-28T19:50:00.000Z', { kind: 'not_assigned', status: 'goalkeeper_withdrew' }],
      ['too early', assignedDoc, '2026-09-28T19:29:59.999Z', { kind: 'too_early', opensAt: new Date('2026-09-28T19:30:00.000Z') }],
      ['too late', assignedDoc, '2026-09-28T20:15:00.001Z', { kind: 'too_late', closedAt: new Date('2026-09-28T20:15:00.000Z') }],
    ])('refuses %s without writing', async (_label, doc, when, expected) => {
      const h = harness();
      h.bookings.findOne.mockResolvedValue(doc);

      expect(await checkIn(h, new Date(when))).toEqual(expected);
      expect(h.bookings.updateOne).not.toHaveBeenCalled();
      expect(h.outbox.insertMany).not.toHaveBeenCalled();
    });
  });
});

function storedIncident(overrides: { moneyReversal?: unknown; forgivenAt?: Date; lifted?: unknown } = {}) {
  const at = new Date('2026-09-28T18:30:00.000Z');
  return {
    _id: 'w-1',
    kind: 'withdrawal',
    goalkeeperId: 'gk-1',
    bookingId: second!.id,
    requestId: 'r-1',
    startsAt: second!.startsAt,
    occurredAt: at,
    noticeMinutes: 90,
    late: true,
    reason: null,
    replacementBookingId: 'id-1',
    penalties: [{ id: 'p-1', kind: 'late', days: 3, startsAt: at, endsAt: new Date('2026-10-01T18:30:00.000Z'), reversal: overrides.lifted ?? null }],
    moneyReversal: overrides.moneyReversal ?? null,
    forgivenAt: overrides.forgivenAt ?? null,
  };
}


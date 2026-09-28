import { describe, expect, it, vi } from 'vitest';
import type { ClientSession, Collection, Db, Document } from 'mongodb';
import { bookingCancelled, bookingExpired } from '../../../../../src/domain/events/bookingEvents.js';
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
  const collections: Record<string, unknown> = { bookings, goalkeeperRequests: requests, wallets, walletMovements: movements, outbox };
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
  return { bookings, requests, movements, outbox, session, store, cancelAll };
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
});

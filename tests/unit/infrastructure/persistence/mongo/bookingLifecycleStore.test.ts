import { describe, expect, it, vi } from 'vitest';
import type { ClientSession, Collection, Db, Document } from 'mongodb';
import { bookingCancelled, bookingExpired } from '../../../../../src/domain/events/bookingEvents.js';
import { MongoBookingLifecycleStore } from '../../../../../src/infrastructure/persistence/mongo/bookingLifecycleStore.js';
import { bookingToDocument } from '../../../../../src/infrastructure/persistence/mongo/bookingRepository.js';
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
});

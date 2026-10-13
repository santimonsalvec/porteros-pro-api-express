import { describe, expect, it, vi } from 'vitest';
import type { ClientSession, Collection, Db, Document } from 'mongodb';
import { bookingCancelled } from '../../../../../src/domain/events/bookingEvents.js';
import { MongoBookingLifecycleStore } from '../../../../../src/infrastructure/persistence/mongo/bookingLifecycleStore.js';
import { bookingToDocument } from '../../../../../src/infrastructure/persistence/mongo/bookingRepository.js';
import { requestToDocument } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperRequestRepository.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';
import { buildRequest, buildRequestBookings } from '../../../../fixtures/quoteFixtures.js';
import { COLOMBIA_INVOICING } from '../../../../fixtures/walletFixtures.js';

// Past the free-cancellation period (it ended at 19:00Z): the client could no longer cancel.
const late = new Date('2026-09-28T19:31:00.000Z');
const request = buildRequest('r-1', new Date('2026-09-28T20:00:00.000Z'), { goalkeeperCount: 2 });
const [first, second] = buildRequestBookings(request);
const pendingDoc = bookingToDocument(first!);
const assignedDoc = bookingToDocument(second!.assign('gk-1', new Date('2026-09-28T15:00:00.000Z')));
const owner = { goalkeeperId: 'gk-1', currency: 'COP', invoicing: COLOMBIA_INVOICING };
const ENDED = {
  status: 'cancelled',
  endedAt: late,
  endReason: 'admin_cancelled',
  cancelledBy: 'admin',
  cancellationNote: 'La cancha cerró por lluvia',
  cancelledByStaffId: 'staff-user-1',
};

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
  bookings.updateOne.mockResolvedValue({});
  requests.updateOne.mockResolvedValue({});
  outbox.insertMany.mockResolvedValue({});
  wallets.findOneAndUpdate.mockResolvedValue({ _id: 'gk-1', currency: 'COP', balance: 20000, lastSequence: 3, createdAt: late, updatedAt: late });
  movements.insertOne.mockResolvedValue({});
  requests.findOne.mockResolvedValue(requestToDocument(request));
  let ids = 0;
  const cancelByAdmin = (bookingId: string | null, owners = new Map([['gk-1', owner]])) =>
    store.cancelByAdmin({
      requestId: 'r-1',
      bookingId,
      now: late,
      staffUserId: 'staff-user-1',
      reason: 'La cancha cerró por lluvia',
      owners,
      newId: () => `m-${++ids}`,
      buildEvent: (booking, refund) => bookingCancelled(`ev-${booking.id}`, booking, late, refund, { reason: 'admin_cancelled', by: 'admin' }),
    });
  return { bookings, requests, movements, outbox, incidents, profiles, session, store, cancelByAdmin };
}

describe('MongoBookingLifecycleStore.cancelByAdmin (admin spec 006, research §1)', () => {
  it("cancels every live booking of the request, whoever's client it is, even past the free-cancellation period", async () => {
    const h = harness();
    h.bookings.find.mockReturnValue(toArrayResult([pendingDoc, assignedDoc]));
    h.bookings.countDocuments.mockResolvedValue(0);
    h.movements.findOne.mockResolvedValueOnce({ _id: 'charge-1', amount: -7000, currency: 'COP' }).mockResolvedValueOnce(null);

    const result = await h.cancelByAdmin(null);

    expect(h.requests.findOne).toHaveBeenCalledWith({ _id: 'r-1' }, { session: h.session });
    expect(h.bookings.updateOne).toHaveBeenCalledWith({ _id: first!.id, status: 'pending_assignment' }, { $set: ENDED }, { session: h.session });
    expect(h.bookings.updateOne).toHaveBeenCalledWith({ _id: second!.id, status: 'assigned' }, { $set: ENDED }, { session: h.session });
    expect(result).toMatchObject({ kind: 'cancelled', refunds: 1 });
    if (result.kind !== 'cancelled') throw new Error(result.kind);
    expect(result.cancelled.map((booking) => [booking.id, booking.cancelledBy, booking.cancelledByStaffId])).toEqual([
      [first!.id, 'admin', 'staff-user-1'],
      [second!.id, 'admin', 'staff-user-1'],
    ]);
    expect(result.events.map((event) => [event.type, (event.payload as { by: string }).by])).toEqual([
      ['booking.cancelled', 'admin'],
      ['booking.cancelled', 'admin'],
    ]);
    // Deactivated once nothing is live (feature 016's rule).
    expect(h.requests.updateOne).toHaveBeenCalledWith({ _id: 'r-1' }, { $set: { active: false } }, { session: h.session });
  });

  it('gives the goalkeeper the whole commission back once, naming the code and the member, never the written reason', async () => {
    const h = harness();
    h.bookings.find.mockReturnValue(toArrayResult([pendingDoc, assignedDoc]));
    h.bookings.countDocuments.mockResolvedValue(1);
    h.movements.findOne.mockResolvedValueOnce({ _id: 'charge-1', amount: -7000, currency: 'COP' }).mockResolvedValueOnce(null);

    await h.cancelByAdmin(second!.id);

    expect(h.movements.insertOne).toHaveBeenCalledTimes(1);
    const refund = h.movements.insertOne.mock.calls[0]![0];
    expect(refund).toMatchObject({
      type: 'commission_refund',
      amount: 7000,
      causeKey: `commission_refund:${second!.id}`,
      cancellation: { by: 'admin', at: late, reason: 'admin_cancelled' },
      actor: { kind: 'admin', userId: 'staff-user-1' },
    });
    expect(JSON.stringify(refund)).not.toContain('lluvia');
  });

  it('cancels only the booking asked for, leaving the others as they are', async () => {
    const h = harness();
    h.bookings.find.mockReturnValue(toArrayResult([pendingDoc, assignedDoc]));
    h.bookings.countDocuments.mockResolvedValue(1);

    expect(await h.cancelByAdmin(first!.id)).toMatchObject({ kind: 'cancelled', refunds: 0 });
    expect(h.bookings.updateOne).toHaveBeenCalledTimes(1);
    expect(h.movements.insertOne).not.toHaveBeenCalled();
  });

  it('never counts against the goalkeeper: no incident, no penalty, no suspension', async () => {
    const h = harness();
    h.bookings.find.mockReturnValue(toArrayResult([assignedDoc]));
    h.bookings.countDocuments.mockResolvedValue(0);
    h.movements.findOne.mockResolvedValueOnce({ _id: 'charge-1', amount: -7000, currency: 'COP' }).mockResolvedValueOnce(null);

    await h.cancelByAdmin(second!.id);

    expect(h.incidents.insertOne).not.toHaveBeenCalled();
    expect(h.incidents.replaceOne).not.toHaveBeenCalled();
    expect(h.profiles.updateOne).not.toHaveBeenCalled();
  });

  it('replays a booking it already cancelled, and a request left with nothing it cancelled, without writing', async () => {
    const h = harness();
    const cancelledDoc = { ...pendingDoc, ...ENDED };
    h.bookings.find.mockReturnValue(toArrayResult([cancelledDoc, { ...assignedDoc, status: 'completed' }]));

    expect(await h.cancelByAdmin(first!.id)).toEqual({ kind: 'replayed' });
    expect(await h.cancelByAdmin(null)).toEqual({ kind: 'replayed' });
    expect(h.bookings.updateOne).not.toHaveBeenCalled();
  });

  it('refuses a booking that already ended otherwise, and a request with nothing live, writing nothing', async () => {
    const h = harness();
    h.bookings.find.mockReturnValue(toArrayResult([{ ...pendingDoc, status: 'expired' }, { ...assignedDoc, status: 'cancelled', cancelledBy: 'client' }]));

    expect(await h.cancelByAdmin(first!.id)).toEqual({ kind: 'already_final', status: 'expired' });
    expect(await h.cancelByAdmin(second!.id)).toEqual({ kind: 'already_final', status: 'cancelled' });
    expect(await h.cancelByAdmin(null)).toMatchObject({ kind: 'already_final' });
    expect(h.bookings.updateOne).not.toHaveBeenCalled();
  });

  it('answers not_found for an unknown request or a booking of another request', async () => {
    const h = harness();
    h.requests.findOne.mockResolvedValueOnce(null);
    expect(await h.cancelByAdmin(null)).toEqual({ kind: 'not_found', what: 'request' });

    h.bookings.find.mockReturnValue(toArrayResult([pendingDoc]));
    expect(await h.cancelByAdmin('other-booking')).toEqual({ kind: 'not_found', what: 'booking' });
  });

  it('asks for the wallet owner of an assigned goalkeeper it lacks, and aborts without a charge, writing nothing', async () => {
    const h = harness();
    h.bookings.find.mockReturnValue(toArrayResult([pendingDoc, assignedDoc]));

    expect(await h.cancelByAdmin(null, new Map())).toEqual({ kind: 'owner_required', goalkeeperId: 'gk-1' });
    h.movements.findOne.mockResolvedValueOnce(null);
    expect(await h.cancelByAdmin(second!.id)).toEqual({ kind: 'missing_charge', bookingId: second!.id });
    expect(h.bookings.updateOne).not.toHaveBeenCalled();
  });
});

describe('cancel all (feature 016) with a booking cancelled by an administrator', () => {
  it('sets it aside like a client cancellation: the request with its other booking assigned is kept', async () => {
    const h = harness();
    h.requests.findOneAndUpdate.mockResolvedValue({ _id: 'r-1' });
    h.bookings.find.mockReturnValue(toArrayResult([{ ...pendingDoc, ...ENDED }, assignedDoc]));

    const result = await h.store.cancelAll({
      requestId: 'r-1',
      now: late,
      owners: new Map([['gk-1', owner]]),
      newId: () => 'm-1',
      buildEvent: (booking, refund) => bookingCancelled(`ev-${booking.id}`, booking, late, refund),
    });

    expect(result).toEqual({ kind: 'kept' });
    expect(h.bookings.updateOne).not.toHaveBeenCalled();
  });
});

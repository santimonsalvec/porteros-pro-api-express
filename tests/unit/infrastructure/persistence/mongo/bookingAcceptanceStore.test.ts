import { describe, expect, it, vi } from 'vitest';
import type { ClientSession, Collection, Db, Document } from 'mongodb';
import { commissionChargeDraft } from '../../../../../src/application/features/wallet/common/walletLedger.js';
import type { Booking } from '../../../../../src/domain/bookings/booking.js';
import { MongoBookingAcceptanceStore } from '../../../../../src/infrastructure/persistence/mongo/bookingAcceptanceStore.js';
import { bookingToDocument } from '../../../../../src/infrastructure/persistence/mongo/bookingRepository.js';
import { createFakeCollection, toArrayCursor } from '../../../../fakes/fakeMongoCollection.js';
import { buildRequest, buildRequestBookings } from '../../../../fixtures/quoteFixtures.js';
import { COLOMBIA_INVOICING } from '../../../../fixtures/walletFixtures.js';

const now = new Date('2026-09-28T15:00:00.000Z');
const request = buildRequest('r-1', new Date('2026-09-28T20:00:00.000Z'), { goalkeeperCount: 1 });
const [pending] = buildRequestBookings(request);
const assignedDoc = bookingToDocument(pending!.assign('gk-1', now));

function harness() {
  const bookings = createFakeCollection();
  const wallets = createFakeCollection();
  const movements = createFakeCollection();
  const collections: Record<string, unknown> = { bookings, wallets, walletMovements: movements };
  const db = { collection: (name: string) => collections[name] as Collection<Document> } as unknown as Db;
  const session = {
    withTransaction: vi.fn(async (fn: (s: ClientSession) => Promise<unknown>, _options?: unknown) => fn(session as unknown as ClientSession)),
    endSession: vi.fn(async () => undefined),
  };
  const store = new MongoBookingAcceptanceStore(() => session as unknown as ClientSession, db);
  wallets.updateOne.mockResolvedValue({});
  wallets.findOneAndUpdate.mockResolvedValue({ _id: 'gk-1', currency: 'COP', balance: 13000, lastSequence: 2, createdAt: now, updatedAt: now });
  movements.insertOne.mockResolvedValue({});
  const draft = (booking: Booking) =>
    commissionChargeDraft({ goalkeeperId: 'gk-1', currency: 'COP', invoicing: COLOMBIA_INVOICING }, { bookingId: booking.id, requestId: booking.requestId, amount: booking.commission }, 'm-1', now);
  const accept = () => store.accept({ bookingId: pending!.id, goalkeeperId: 'gk-1', now, commissionDraft: draft });
  return { bookings, wallets, movements, session, accept };
}

describe('MongoBookingAcceptanceStore (mocked driver)', () => {
  it('claims the booking only while pending, open and not their own, then charges — all in the session', async () => {
    const { bookings, movements, session, accept } = harness();
    bookings.findOneAndUpdate.mockResolvedValue(assignedDoc);
    bookings.find.mockReturnValue(toArrayCursor([]));

    const result = await accept();

    expect(bookings.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: pending!.id, status: 'pending_assignment', searchEndsAt: { $gt: now }, clientId: { $ne: 'gk-1' } },
      { $set: { status: 'assigned', goalkeeperId: 'gk-1', assignedAt: now } },
      { returnDocument: 'after', session },
    );
    expect(bookings.find).toHaveBeenCalledWith({ goalkeeperId: 'gk-1', status: 'assigned', _id: { $ne: pending!.id } }, { session });
    expect(movements.insertOne.mock.calls[0]![0]).toMatchObject({ type: 'commission_charge', amount: -7000, causeKey: `commission:${pending!.id}` });
    expect(movements.insertOne.mock.calls[0]![1]).toEqual({ session });
    expect(result).toMatchObject({ kind: 'accepted', booking: { id: pending!.id, status: 'assigned', goalkeeperId: 'gk-1' } });
  });

  it('reports not_claimed when the booking cannot be claimed, charging nothing', async () => {
    const { bookings, movements, accept } = harness();
    bookings.findOneAndUpdate.mockResolvedValue(null);

    expect(await accept()).toEqual({ kind: 'not_claimed' });
    expect(movements.insertOne).not.toHaveBeenCalled();
  });

  it('aborts on a clash with a held booking, charging nothing', async () => {
    const { bookings, movements, accept } = harness();
    bookings.findOneAndUpdate.mockResolvedValue(assignedDoc);
    const clashing = buildRequestBookings(buildRequest('r-2', new Date('2026-09-28T21:00:00.000Z'), { goalkeeperCount: 1 }))[0]!.assign('gk-1', now);
    bookings.find.mockReturnValue(toArrayCursor([bookingToDocument(clashing)]));

    expect(await accept()).toEqual({ kind: 'schedule_conflict', conflictingBookingId: clashing.id });
    expect(movements.insertOne).not.toHaveBeenCalled();
  });

  it('aborts when the goalkeeper already holds another booking of the same request', async () => {
    const { bookings, accept } = harness();
    bookings.findOneAndUpdate.mockResolvedValue(assignedDoc);
    const sibling = buildRequestBookings(request, ['r-1-other'])[0]!.assign('gk-1', now);
    bookings.find.mockReturnValue(toArrayCursor([bookingToDocument(sibling)]));

    expect(await accept()).toEqual({ kind: 'same_request' });
  });

  it('aborts when the wallet cannot cover the commission', async () => {
    const { bookings, wallets, movements, accept } = harness();
    bookings.findOneAndUpdate.mockResolvedValue(assignedDoc);
    bookings.find.mockReturnValue(toArrayCursor([]));
    wallets.findOneAndUpdate.mockResolvedValue(null);
    wallets.findOne.mockResolvedValue({ _id: 'gk-1', currency: 'COP', balance: 5000, lastSequence: 1, createdAt: now, updatedAt: now });

    expect(await accept()).toEqual({ kind: 'insufficient_funds', balance: 5000 });
    expect(movements.insertOne).not.toHaveBeenCalled();
  });

  it('rethrows anything else and always ends the session', async () => {
    const { bookings, session, accept } = harness();
    bookings.findOneAndUpdate.mockRejectedValue(new Error('connection reset'));

    await expect(accept()).rejects.toThrow('connection reset');
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});

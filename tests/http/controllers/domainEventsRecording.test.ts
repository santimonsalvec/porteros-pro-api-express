import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { RunSweepCommand } from '../../../src/application/features/events/commands/runSweep/runSweepCommand.js';
import { buildTestApp } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

async function setUp() {
  const context = await buildTestApp();
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-0701');
  return { context, client };
}

const types = (context: TestApp) => context.outboxStore.all().map((entry) => entry.event.type);

describe('Domain events are recorded with the change (013 US1)', () => {
  it('a 2-goalkeeper confirmation records 2 booking.created; its replay records none', async () => {
    const { context, client } = await setUp();
    const quote = await request(context.app)
      .post('/api/goalkeeper-requests/quote')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ latitude: 3.45, longitude: -76.5, startsAt: '2026-09-21T15:00:00', goalkeeperCount: 2, durationMinutes: 90 });
    const confirm = () =>
      request(context.app).post('/api/goalkeeper-requests/bookings').set('Authorization', `Bearer ${client.token}`).send({ quoteId: quote.body.quoteId });

    const created = await confirm();
    const replay = await confirm();

    expect([created.status, replay.status]).toEqual([201, 200]);
    expect(types(context)).toEqual(['booking.created', 'booking.created']);
    expect(context.outboxStore.all().map((entry) => entry.event.bookingId).sort()).toEqual(
      created.body.bookings.map((booking: { bookingId: string }) => booking.bookingId).sort(),
    );
  });

  it('an acceptance records one goalkeeper.assigned and its commission.charged (023); a repeat records none', async () => {
    const { context, client } = await setUp();
    const goalkeeper = await signInGoalkeeper(context, 'sub-0702');
    await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo', operationKey: 'k-gk' });
    const bookingId = (await createRequestAsClient(context, client.token)).bookings[0]!.bookingId;
    const accept = () =>
      request(context.app).post(`/api/goalkeepers/me/bookings/${bookingId}/accept`).set('Authorization', `Bearer ${goalkeeper.token}`);

    await accept();
    await accept();

    expect(types(context)).toEqual(['booking.created', 'booking.created', 'goalkeeper.assigned', 'commission.charged']);
    expect(context.outboxStore.all()[2]!.event).toMatchObject({ bookingId, payload: { goalkeeperId: goalkeeper.userId, commission: 7000 } });
  });
});

describe('Recorded events reach the messaging service, even after a failure (013 US2)', () => {
  it('publishes the events before the confirmation responds', async () => {
    const { context, client } = await setUp();

    const created = await createRequestAsClient(context, client.token);

    expect(context.eventPublisher.published().map((event) => event.bookingId).sort()).toEqual(
      created.bookings.map((booking) => booking.bookingId).sort(),
    );
    expect(context.outboxStore.pending()).toHaveLength(0);
  });

  it('a publishing outage never fails the confirmation; the sweep publishes the events later', async () => {
    const { context, client } = await setUp();
    context.eventPublisher.failNextWith(new Error('pubsub down'));

    await createRequestAsClient(context, client.token); // throws unless 201

    expect(context.outboxStore.pending()).toHaveLength(2);
    context.clock.advance(31_000); // past the relay's 30-second lease
    const report = await context.mediator.send(new RunSweepCommand());

    expect(report).toMatchObject({ published: 2, stillPending: 0 });
    expect(context.eventPublisher.published()).toHaveLength(2);
  });
});

describe('Local mode end to end (013 US3)', () => {
  it('a confirmation reaches the delivery log during the request, with no cloud', async () => {
    const context = await buildTestApp({ eventsMode: 'local' });
    context.clock.set(MATCH_NOW);
    const client = await signInClient(context, 'sub-0711');

    const created = await createRequestAsClient(context, client.token);

    expect(context.eventDeliveryLog.all().map((event) => event.bookingId).sort()).toEqual(
      created.bookings.map((booking) => booking.bookingId).sort(),
    );
    expect(context.outboxStore.pending()).toHaveLength(0);
  });
});

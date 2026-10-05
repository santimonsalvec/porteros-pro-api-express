import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';
import { buildGoalkeeperProfile } from '../../fixtures/walletFixtures.js';
import type { DomainEvent } from '../../../src/domain/events/domainEvent.js';
import { RunSweepCommand } from '../../../src/application/features/events/commands/runSweep/runSweepCommand.js';

/** Signs a goalkeeper in, gives them a phone and (optionally) 20.000 COP. */
async function goalkeeperWithPhone(context: TestApp, sub: string, funded = true) {
  const goalkeeper = await signInGoalkeeper(context, sub);
  await request(context.app)
    .post('/devices')
    .set('Authorization', `Bearer ${goalkeeper.token}`)
    .send({ token: `phone-${sub}`, platform: 'android' });
  if (funded) {
    await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: `k-${sub}` });
  }
  return goalkeeper;
}

async function setUp() {
  const context = await buildTestApp({ eventsMode: 'local' });
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-0501');
  return { context, client };
}

describe('Offers — US1: eligible goalkeepers hear about a new match right away', () => {
  it('one offer and one push per eligible goalkeeper for a 2-goalkeeper request, none for the others', async () => {
    const { context, client } = await setUp();
    const eligible = await goalkeeperWithPhone(context, 'sub-0502');
    const poor = await goalkeeperWithPhone(context, 'sub-0503', false);
    const switchedOff = await goalkeeperWithPhone(context, 'sub-0504');
    context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(switchedOff.userId, { zoneIds: ['zone-cali-norte'], availableForOffers: false }));

    const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 2 });

    const offers = context.notificationRepository.all();
    expect(offers.map((offer) => offer.userId)).toEqual([eligible.userId]);
    expect(offers[0]).toMatchObject({ type: 'booking.available', requestId: created.requestId, reminderCount: 0 });
    expect(context.pushSender.calls.map((call) => call.userId)).toEqual([eligible.userId]);
    expect(context.pushSender.calls[0]!.message.body).toMatch(/^Norte · .+ · 90 min · Grama sintética · Torneo$/);
    expect(context.pushSender.calls[0]!.message.data).toMatchObject({ type: 'booking.available', requestId: created.requestId });
    expect(poor.userId).not.toBe(eligible.userId);
  });

  it('does not offer a match to the client who made it, even if they are a goalkeeper', async () => {
    const { context } = await setUp();
    const clientGoalkeeper = await goalkeeperWithPhone(context, 'sub-0505');

    await createRequestAsClient(context, clientGoalkeeper.token, { goalkeeperCount: 1 });

    expect(context.notificationRepository.all()).toHaveLength(0);
    expect(context.pushSender.calls).toHaveLength(0);
  });

  it('creates nothing more when the same events are delivered again', async () => {
    const { context, client } = await setUp();
    await goalkeeperWithPhone(context, 'sub-0506');
    await createRequestAsClient(context, client.token, { goalkeeperCount: 2 });

    const events = context.outboxStore.all().map((entry) => entry.event);
    expect(events.map((event) => event.type)).toEqual(['booking.created', 'booking.created']);
    // The same deliveries again (skipped by the consumer), then copies with new ids (only the
    // offer's unique key stops them).
    for (const event of events) await context.mediator.publish(event);
    for (const event of events) await context.mediator.publish({ ...event, id: `${event.id}-copy` } as DomainEvent);

    expect(context.notificationRepository.all()).toHaveLength(1);
    expect(context.pushSender.calls).toHaveLength(1);
  });
});

describe('Offers — US2: goalkeepers who have not acted are reminded, at most 3 times', () => {
  it('the every-minute sweep reminds every 5 minutes, 3 times, then stops', async () => {
    const { context, client } = await setUp();
    const goalkeeper = await goalkeeperWithPhone(context, 'sub-0511');
    await createRequestAsClient(context, client.token, { goalkeeperCount: 1 });
    const pushesTo = () => context.pushSender.calls.filter((call) => call.userId === goalkeeper.userId).length;
    expect(pushesTo()).toBe(1);

    const minute = 60_000;
    const counts: number[] = [];
    for (let elapsed = 1; elapsed <= 25; elapsed += 1) {
      context.clock.advance(minute);
      await context.mediator.send(new RunSweepCommand());
      counts.push(pushesTo());
    }

    expect(counts[3]).toBe(1); // minute 4: too soon
    expect(counts[4]).toBe(2); // minute 5: first reminder
    expect(counts.at(-1)).toBe(4); // 3 reminders, then nothing
    expect(context.notificationRepository.all()[0]!.reminderCount).toBe(3);
  });

  it('stops reminding once the goalkeeper opened the offer', async () => {
    const { context, client } = await setUp();
    const goalkeeper = await goalkeeperWithPhone(context, 'sub-0512');
    await createRequestAsClient(context, client.token, { goalkeeperCount: 1 });
    const offer = context.notificationRepository.all()[0]!;
    await context.notificationRepository.markRead(offer.id, goalkeeper.userId, context.clock.now());

    context.clock.advance(10 * 60_000);
    await context.mediator.send(new RunSweepCommand());

    expect(context.pushSender.calls).toHaveLength(1);
  });
});

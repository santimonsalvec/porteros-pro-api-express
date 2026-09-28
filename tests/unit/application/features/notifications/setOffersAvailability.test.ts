import { describe, expect, it } from 'vitest';
import { SetOffersAvailabilityCommand } from '../../../../../src/application/features/notifications/commands/setOffersAvailability/setOffersAvailabilityCommand.js';
import { SetOffersAvailabilityCommandHandler } from '../../../../../src/application/features/notifications/commands/setOffersAvailability/setOffersAvailabilityCommandHandler.js';
import { offerHarness } from './offerHarness.js';

function harness() {
  const h = offerHarness();
  const handler = new SetOffersAvailabilityCommandHandler({
    goalkeeperProfileRepository: h.goalkeeperProfileRepository,
    eligibility: h.eligibility,
    sender: h.sender,
    clock: h.clock,
    logger: h.silent,
  });
  const set = (available: boolean, goalkeeperId = 'g1') => handler.handle(new SetOffersAvailabilityCommand(goalkeeperId, available));
  return { ...h, set };
}

describe('SetOffersAvailabilityCommandHandler', () => {
  it('turning offers off saves it and sends nothing', async () => {
    const h = harness();
    h.goalkeeper('g1');
    h.match('r1');

    expect(await h.set(false)).toEqual({ outcome: 'updated', availableForOffers: false, offersSent: 0 });
    expect((await h.goalkeeperProfileRepository.getByUserId('g1'))!.availableForOffers).toBe(false);
    expect(h.notifications.all()).toHaveLength(0);
  });

  it('turning offers on sends the open matches right away, in one push', async () => {
    const h = harness();
    h.goalkeeper('g1', { availableForOffers: false });
    await h.phone('g1');
    h.match('r1', 3);
    h.match('r2', 6);

    expect(await h.set(true)).toEqual({ outcome: 'updated', availableForOffers: true, offersSent: 2 });
    expect(h.pushSender.calls).toHaveLength(1);
    expect(h.pushSender.calls[0]!.message.body).toBe('Hay 2 partidos disponibles en tus zonas');
    expect(h.pushState.lastPushOf('g1')).toEqual(h.clock.now());
  });

  it('turning offers on when already on sends nothing', async () => {
    const h = harness();
    h.goalkeeper('g1');
    await h.phone('g1');
    h.match('r1');

    expect(await h.set(true)).toEqual({ outcome: 'updated', availableForOffers: true, offersSent: 0 });
    expect(h.pushSender.calls).toHaveLength(0);
  });

  it('does not re-send offers the goalkeeper already had', async () => {
    const h = harness();
    h.goalkeeper('g1');
    await h.phone('g1');
    const { bookings } = h.match('r1');
    await h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'first');
    await h.set(false);

    expect(await h.set(true)).toMatchObject({ offersSent: 0 });
    expect(h.pushSender.calls).toHaveLength(1);
  });

  it('sends nothing when no match is open, and refuses a non-goalkeeper', async () => {
    const h = harness();
    h.goalkeeper('g1', { availableForOffers: false });

    expect(await h.set(true)).toEqual({ outcome: 'updated', availableForOffers: true, offersSent: 0 });
    expect(await h.set(true, 'nobody')).toEqual({ outcome: 'not_a_goalkeeper' });
  });
});

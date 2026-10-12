import { describe, expect, it } from 'vitest';
import { SetOffersAvailabilityCommand } from '../../../../../src/application/features/notifications/commands/setOffersAvailability/setOffersAvailabilityCommand.js';
import { SetOffersAvailabilityCommandHandler } from '../../../../../src/application/features/notifications/commands/setOffersAvailability/setOffersAvailabilityCommandHandler.js';
import { FakeUserBlockRepository } from '../../../../fakes/fakeUserBlockRepository.js';
import { offerHarness } from './offerHarness.js';

describe('a blocked goalkeeper and the offers switch (admin spec 005, FR-029)', () => {
  it('can turn the offers off but not on', async () => {
    const h = offerHarness();
    h.goalkeeper('g1');
    const blocks = new FakeUserBlockRepository();
    await blocks.block('g1', 'staff', 'Acoso', new Date('2026-10-12T15:00:00.000Z'));
    const handler = new SetOffersAvailabilityCommandHandler({
      goalkeeperProfileRepository: h.goalkeeperProfileRepository, eligibility: h.eligibility, sender: h.sender, clock: h.clock, logger: h.silent, blocks,
    });

    expect(await handler.handle(new SetOffersAvailabilityCommand('g1', true))).toEqual({ outcome: 'account_blocked' });
    expect(await handler.handle(new SetOffersAvailabilityCommand('g1', false))).toMatchObject({ outcome: 'updated', availableForOffers: false });
  });
});

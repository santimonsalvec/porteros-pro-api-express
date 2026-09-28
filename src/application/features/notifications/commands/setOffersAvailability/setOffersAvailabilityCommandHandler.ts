import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import type { OfferEligibilityService } from '../../common/offerEligibilityService.js';
import type { OfferSender } from '../../common/offerSender.js';
import type { IOffersLogger } from '../../common/ports.js';
import { SetOffersAvailabilityCommand, type SetOffersAvailabilityResult } from './setOffersAvailabilityCommand.js';

export interface SetOffersAvailabilityDependencies {
  goalkeeperProfileRepository: IGoalkeeperProfileRepository;
  eligibility: OfferEligibilityService;
  sender: OfferSender;
  clock: IClock;
  logger: IOffersLogger;
}

/**
 * Saves the switch. Turning it on (from off) sends the offers for the open matches the goalkeeper
 * can take right away — one push — instead of waiting for the next round (clarification 4,
 * FR-027). Offers they already had keep their reminder count; turning it on twice sends nothing.
 */
export class SetOffersAvailabilityCommandHandler
  implements ICommandHandler<SetOffersAvailabilityCommand, SetOffersAvailabilityResult>
{
  constructor(private readonly deps: SetOffersAvailabilityDependencies) {}

  async handle(command: SetOffersAvailabilityCommand): Promise<SetOffersAvailabilityResult> {
    const { goalkeeperId, available } = command;
    const changed = await this.deps.goalkeeperProfileRepository.setAvailableForOffers(goalkeeperId, available);
    if (!changed) return { outcome: 'not_a_goalkeeper' };
    this.deps.logger.info(
      { outcome: 'offers_availability_changed', goalkeeperId, availableForOffers: available, previous: changed.previous },
      'Offers availability changed',
    );

    if (!available || changed.previous) return { outcome: 'updated', availableForOffers: available, offersSent: 0 };

    const now = this.deps.clock.now();
    const open = await this.deps.eligibility.availableBookingsFor(goalkeeperId, now);
    if (open.kind !== 'ok' || open.bookings.length === 0) return { outcome: 'updated', availableForOffers: true, offersSent: 0 };

    const report = await this.deps.sender.send(new Map([[goalkeeperId, open.bookings]]), now, 'catchUp');
    this.deps.logger.info({ outcome: 'offers_catch_up', goalkeeperId, ...report }, 'Open offers sent after turning offers on');
    return { outcome: 'updated', availableForOffers: true, offersSent: report.entriesCreated };
  }
}

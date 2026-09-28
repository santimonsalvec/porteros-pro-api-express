import { ICommand } from '../../../../common/mediator/types.js';

export type SetOffersAvailabilityResult =
  | { outcome: 'updated'; availableForOffers: boolean; offersSent: number }
  | { outcome: 'not_a_goalkeeper' };

/** The goalkeeper turns offers on or off (Story 4, clarifications 2–4). */
export class SetOffersAvailabilityCommand extends ICommand<SetOffersAvailabilityResult> {
  constructor(
    readonly goalkeeperId: string,
    readonly available: boolean,
  ) {
    super();
  }
}

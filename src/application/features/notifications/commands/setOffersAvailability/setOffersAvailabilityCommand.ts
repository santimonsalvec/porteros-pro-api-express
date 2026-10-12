import { ICommand } from '../../../../common/mediator/types.js';

export type SetOffersAvailabilityResult =
  | { outcome: 'updated'; availableForOffers: boolean; offersSent: number }
  | { outcome: 'not_a_goalkeeper' }
  /** The administration blocked this goalkeeper: offers can't be turned on (porteros-pro-admin spec 005). */
  | { outcome: 'account_blocked' };

/** The goalkeeper turns offers on or off (Story 4, clarifications 2–4). */
export class SetOffersAvailabilityCommand extends ICommand<SetOffersAvailabilityResult> {
  constructor(
    readonly goalkeeperId: string,
    readonly available: boolean,
  ) {
    super();
  }
}

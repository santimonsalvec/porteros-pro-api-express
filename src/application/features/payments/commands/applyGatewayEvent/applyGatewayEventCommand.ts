import { ICommand } from '../../../../common/mediator/types.js';

export type ApplyGatewayEventOutcome =
  /** The top-up took the event's final status (an approval was credited). */
  | 'applied'
  /** A repeat, or the top-up already has a final status. */
  | 'unchanged'
  /** Not about a known top-up, not a transaction event, or still pending. */
  | 'ignored'
  /** The signature does not match: nothing changed. */
  | 'rejected'
  /** Genuine, but for another amount or currency: nothing was credited. */
  | 'mismatch'
  /** An internal failure: the gateway should deliver the event again. */
  | 'error';

export interface ApplyGatewayEventResult {
  outcome: ApplyGatewayEventOutcome;
}

/** An event a payment gateway sent to the webhook (research.md §2). */
export class ApplyGatewayEventCommand extends ICommand<ApplyGatewayEventResult> {
  constructor(
    public readonly gateway: string,
    public readonly body: unknown,
    public readonly headers: Record<string, string | undefined>,
  ) {
    super();
  }
}

import { IQuery } from '../../../../common/mediator/types.js';

export interface ClosureGate {
  /** The user asked to leave and the account is inactive. */
  closing: boolean;
  /** An administrator asked for a deposit that covers the debt: depositing is the one thing allowed. */
  debtDepositAllowed: boolean;
}

/** Whether the user's account is inactive because of a closure request (feature 029, FR-021). */
export class GetClosureGateQuery extends IQuery<ClosureGate> {
  constructor(readonly userId: string) {
    super();
  }
}

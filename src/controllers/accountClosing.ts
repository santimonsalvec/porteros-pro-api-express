import type { ISender } from '../application/common/mediator/types.js';
import { GetClosureGateQuery } from '../application/features/accountClosures/queries/getClosureGate/getClosureGateQuery.js';
import { ApiError } from './apiError.js';

/** The answer of every operation refused because the account is inactive (feature 029, FR-021). */
export const accountClosing = () =>
  new ApiError(409, 'account_closing', 'Your account is being closed; open the closure status to see what is left.');

/**
 * Throws `account_closing` while the user has an open closure request. `allowDebtDeposit` lets a
 * deposit through when an administrator asked for one to cover the debt.
 */
export async function assertNotClosing(mediator: ISender, userId: string, options: { allowDebtDeposit?: boolean } = {}): Promise<void> {
  const gate = await mediator.send(new GetClosureGateQuery(userId));
  if (gate.closing && !(options.allowDebtDeposit && gate.debtDepositAllowed)) throw accountClosing();
}

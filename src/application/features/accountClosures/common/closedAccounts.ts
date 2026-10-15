import type { IClock } from '../../../common/clock.js';
import type { IAccountClosureRepository } from './ports.js';

/**
 * The logical deletion seen from the sign-in (feature 029): a closed account can't renew a session,
 * and its user signing in again brings it back with its history (FR-031).
 */
export interface ClosedAccounts {
  isClosed(userId: string): Promise<boolean>;
  /** Marks the closure `reopened` when the account was closed; `true` when it was. */
  reopenIfClosed(userId: string): Promise<boolean>;
}

/** What handlers use when closures are not wired (older tests, tools). */
export const NO_CLOSED_ACCOUNTS: ClosedAccounts = {
  isClosed: async () => false,
  reopenIfClosed: async () => false,
};

export class ClosedAccountsService implements ClosedAccounts {
  constructor(
    private readonly closures: Pick<IAccountClosureRepository, 'findClosedByUserId' | 'save'>,
    private readonly clock: IClock,
  ) {}

  async isClosed(userId: string): Promise<boolean> {
    return (await this.closures.findClosedByUserId(userId)) !== null;
  }

  async reopenIfClosed(userId: string): Promise<boolean> {
    const closed = await this.closures.findClosedByUserId(userId);
    if (!closed) return false;
    const transition = closed.reopen(this.clock.now());
    return transition.ok ? this.closures.save(transition.closure, 'closed') : false;
  }
}

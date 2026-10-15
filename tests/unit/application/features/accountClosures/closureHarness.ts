import type { AccountClosureDependencies } from '../../../../../src/application/features/accountClosures/common/accountClosureDependencies.js';
import { FakeAccountClosureRepository } from '../../../../fakes/fakeAccountClosureRepository.js';
import { FakeClosureBlockersReader } from '../../../../fakes/fakeClosureBlockersReader.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { PaymentsHarness } from '../payments/paymentsHarness.js';

/** The Cali operating balance world with an account-closure repository and a blockers reader. */
export class ClosureHarness {
  readonly payments = new PaymentsHarness();
  readonly closures = new FakeAccountClosureRepository();
  readonly blockers = new FakeClosureBlockersReader();
  readonly users = new FakeUserRepository();
  suggested: number | null = 40000;
  readonly searchResults = new Map<string, string[]>();

  get world() {
    return this.payments.operatingBalance;
  }

  get deps(): AccountClosureDependencies {
    return {
      closures: this.closures,
      userSearch: { findIds: async (q) => this.searchResults.get(q) ?? [] },
      users: this.users,
      profiles: this.world.profiles,
      balanceContext: this.world.context,
      balances: this.world.store,
      movements: this.world.store,
      ledger: this.world.ledger,
      blockers: this.blockers,
      notices: this.payments.noticeDeps,
      devices: this.payments.devices,
      suggestDepositAmount: async () => this.suggested,
      idGenerator: this.payments.idGenerator,
      clock: this.payments.clock,
    };
  }

  /** A goalkeeper of Cali with `balance` in the operating balance (negative through a penalty). */
  async goalkeeper(id: string, balance = 0): Promise<string> {
    this.payments.goalkeeper(id);
    if (balance > 0) await this.world.credit(id, balance);
    if (balance < 0) await this.world.ledger.applyPenalty(this.world.owner(id), { penaltyEventId: `e-${id}`, amount: -balance });
    return id;
  }
}

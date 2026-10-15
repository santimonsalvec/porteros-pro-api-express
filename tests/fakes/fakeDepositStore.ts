import type { ApplyOutcomeArgs, ApplyOutcomeResult, IDepositStore } from '../../src/application/features/payments/common/ports.js';
import { canTransition } from '../../src/domain/deposits/deposit.js';
import { matchesCharge, depositMovementDrafts } from '../../src/infrastructure/persistence/mongo/depositStore.js';
import type { FakeDepositRepository } from './fakeDepositRepository.js';
import type { FakeOperatingBalanceStore } from './fakeOperatingBalanceStore.js';

/**
 * The deposit transaction on in-memory state: the same checks and the same movements as the Mongo
 * store. Tests call it sequentially, so there is no concurrency to guard against.
 */
export class FakeDepositStore implements IDepositStore {
  private nextId = 0;

  constructor(
    private readonly deposits: FakeDepositRepository,
    private readonly operatingBalance: FakeOperatingBalanceStore,
  ) {}

  async applyOutcome(args: ApplyOutcomeArgs): Promise<ApplyOutcomeResult> {
    const deposit = await this.deposits.getById(args.depositId);
    if (!deposit) return { kind: 'not_found' };
    if (!matchesCharge(deposit, args.charged)) return { kind: 'mismatch', deposit };
    if (!canTransition(deposit.status, args.status)) return { kind: 'unchanged', deposit };

    let balance: number | null = null;
    if (args.status === 'approved') {
      const ids: [string, string] = [`deposit-movement-${++this.nextId}`, `deposit-movement-${++this.nextId}`];
      for (const draft of depositMovementDrafts(deposit, args, ids)) {
        const appended = await this.operatingBalance.append(draft);
        if (appended.kind !== 'recorded') throw new Error(`Deposit ${deposit.id}: ${draft.type} was not recorded (${appended.kind})`);
        balance = appended.operatingBalance.balance;
      }
    }
    const finalized = deposit.finalize(args.status, args.gatewayTransactionId, args.now);
    this.deposits.put(finalized);
    return { kind: 'applied', deposit: finalized, balance };
  }
}

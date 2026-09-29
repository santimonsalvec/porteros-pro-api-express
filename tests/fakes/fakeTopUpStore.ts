import type { ApplyOutcomeArgs, ApplyOutcomeResult, ITopUpStore } from '../../src/application/features/payments/common/ports.js';
import { canTransition } from '../../src/domain/payments/topUp.js';
import { matchesCharge, topUpMovementDrafts } from '../../src/infrastructure/persistence/mongo/topUpStore.js';
import type { FakeTopUpRepository } from './fakeTopUpRepository.js';
import type { FakeWalletStore } from './fakeWalletStore.js';

/**
 * The top-up transaction on in-memory state: the same checks and the same movements as the Mongo
 * store. Tests call it sequentially, so there is no concurrency to guard against.
 */
export class FakeTopUpStore implements ITopUpStore {
  private nextId = 0;

  constructor(
    private readonly topUps: FakeTopUpRepository,
    private readonly wallet: FakeWalletStore,
  ) {}

  async applyOutcome(args: ApplyOutcomeArgs): Promise<ApplyOutcomeResult> {
    const topUp = await this.topUps.getById(args.topUpId);
    if (!topUp) return { kind: 'not_found' };
    if (!matchesCharge(topUp, args.charged)) return { kind: 'mismatch', topUp };
    if (!canTransition(topUp.status, args.status)) return { kind: 'unchanged', topUp };

    let balance: number | null = null;
    if (args.status === 'approved') {
      const ids: [string, string] = [`top-up-movement-${++this.nextId}`, `top-up-movement-${++this.nextId}`];
      for (const draft of topUpMovementDrafts(topUp, args, ids)) {
        const appended = await this.wallet.append(draft);
        if (appended.kind !== 'recorded') throw new Error(`Top-up ${topUp.id}: ${draft.type} was not recorded (${appended.kind})`);
        balance = appended.wallet.balance;
      }
    }
    const finalized = topUp.finalize(args.status, args.gatewayTransactionId, args.now);
    this.topUps.put(finalized);
    return { kind: 'applied', topUp: finalized, balance };
  }
}

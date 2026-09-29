import type {
  AppendResult,
  IWalletMovementRepository,
  IWalletRepository,
  IWalletStore,
  MovementDraft,
} from '../../src/application/features/wallet/common/ports.js';
import { Wallet } from '../../src/domain/wallet/wallet.js';
import { isGuardedDebit, WalletMovement } from '../../src/domain/wallet/walletMovement.js';

/**
 * In-memory ledger applying the store's rules (research.md §2–§3): lazy wallet, guarded debits,
 * consecutive sequence, resulting balance, one movement per cause. It also serves the two read
 * ports over the same state, so a test sees exactly what it wrote.
 */
export class FakeWalletStore implements IWalletStore, IWalletRepository, IWalletMovementRepository {
  private readonly walletState = new Map<string, Wallet>();
  private readonly movementState: WalletMovement[] = [];

  constructor(private readonly now: () => Date = () => new Date('2026-09-27T18:00:00.000Z')) {}

  wallets(): Wallet[] {
    return [...this.walletState.values()];
  }

  movements(): WalletMovement[] {
    return [...this.movementState];
  }

  async append(draft: MovementDraft): Promise<AppendResult> {
    const existing = this.movementState.find((movement) => movement.causeKey === draft.causeKey);
    if (existing) return { kind: 'duplicate', movement: existing };

    const now = this.now();
    const current = this.walletState.get(draft.goalkeeperId) ?? Wallet.empty(draft.goalkeeperId, draft.currency, now);
    if (current.currency !== draft.currency) throw new Error(`Wallet ${draft.goalkeeperId} is in ${current.currency}`);
    if (isGuardedDebit(draft.type, draft.amount) && current.balance + draft.amount < 0) {
      return { kind: 'insufficient_funds', balance: current.balance };
    }

    const wallet = Wallet.rehydrate({
      ...current,
      balance: current.balance + draft.amount,
      lastSequence: current.lastSequence + 1,
      updatedAt: now,
    });
    const { goalkeeperId, ...fields } = draft;
    const movement = WalletMovement.rehydrate({
      ...fields,
      walletId: goalkeeperId,
      sequence: wallet.lastSequence,
      balanceAfter: wallet.balance,
    });
    this.walletState.set(goalkeeperId, wallet);
    this.movementState.push(movement);
    return { kind: 'recorded', movement, wallet };
  }

  async findByGoalkeeperIds(goalkeeperIds: readonly string[]): Promise<Wallet[]> {
    return this.wallets().filter((wallet) => goalkeeperIds.includes(wallet.goalkeeperId));
  }

  async findByGoalkeeperId(goalkeeperId: string): Promise<Wallet | null> {
    return this.walletState.get(goalkeeperId) ?? null;
  }

  async findById(id: string): Promise<WalletMovement | null> {
    return this.movementState.find((movement) => movement.id === id) ?? null;
  }

  async findByCauseKey(causeKey: string): Promise<WalletMovement | null> {
    return this.movementState.find((movement) => movement.causeKey === causeKey) ?? null;
  }

  async listForWallet(walletId: string, skip: number, limit: number): Promise<WalletMovement[]> {
    return this.movementState
      .filter((movement) => movement.walletId === walletId)
      .sort((a, b) => b.sequence - a.sequence)
      .slice(skip, skip + limit);
  }
}

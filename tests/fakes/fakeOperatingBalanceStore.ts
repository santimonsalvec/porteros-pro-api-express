import type {
  AppendResult,
  IBalanceMovementRepository,
  IOperatingBalanceRepository,
  IOperatingBalanceStore,
  MovementDraft,
} from '../../src/application/features/operatingBalance/common/ports.js';
import { OperatingBalance } from '../../src/domain/operatingBalance/operatingBalance.js';
import { isGuardedDebit, BalanceMovement } from '../../src/domain/operatingBalance/balanceMovement.js';

/**
 * In-memory ledger applying the store's rules (research.md §2–§3): lazy operating balance, guarded debits,
 * consecutive sequence, resulting balance, one movement per cause. It also serves the two read
 * ports over the same state, so a test sees exactly what it wrote.
 */
export class FakeOperatingBalanceStore implements IOperatingBalanceStore, IOperatingBalanceRepository, IBalanceMovementRepository {
  private readonly operatingBalanceState = new Map<string, OperatingBalance>();
  private readonly movementState: BalanceMovement[] = [];

  constructor(private readonly now: () => Date = () => new Date('2026-09-27T18:00:00.000Z')) {}

  operatingBalances(): OperatingBalance[] {
    return [...this.operatingBalanceState.values()];
  }

  movements(): BalanceMovement[] {
    return [...this.movementState];
  }

  async append(draft: MovementDraft): Promise<AppendResult> {
    const existing = this.movementState.find((movement) => movement.causeKey === draft.causeKey);
    if (existing) return { kind: 'duplicate', movement: existing };

    const now = this.now();
    const current = this.operatingBalanceState.get(draft.goalkeeperId) ?? OperatingBalance.empty(draft.goalkeeperId, draft.currency, now);
    if (current.currency !== draft.currency) throw new Error(`OperatingBalance ${draft.goalkeeperId} is in ${current.currency}`);
    if (isGuardedDebit(draft.type, draft.amount) && current.balance + draft.amount < 0) {
      return { kind: 'insufficient_funds', balance: current.balance };
    }

    const operatingBalance = OperatingBalance.rehydrate({
      ...current,
      balance: current.balance + draft.amount,
      lastSequence: current.lastSequence + 1,
      updatedAt: now,
    });
    const { goalkeeperId, ...fields } = draft;
    const movement = BalanceMovement.rehydrate({
      ...fields,
      operatingBalanceId: goalkeeperId,
      sequence: operatingBalance.lastSequence,
      balanceAfter: operatingBalance.balance,
    });
    this.operatingBalanceState.set(goalkeeperId, operatingBalance);
    this.movementState.push(movement);
    return { kind: 'recorded', movement, operatingBalance };
  }

  async findByGoalkeeperIds(goalkeeperIds: readonly string[]): Promise<OperatingBalance[]> {
    return this.operatingBalances().filter((operatingBalance) => goalkeeperIds.includes(operatingBalance.goalkeeperId));
  }

  async findByGoalkeeperId(goalkeeperId: string): Promise<OperatingBalance | null> {
    return this.operatingBalanceState.get(goalkeeperId) ?? null;
  }

  async findById(id: string): Promise<BalanceMovement | null> {
    return this.movementState.find((movement) => movement.id === id) ?? null;
  }

  async findByCauseKey(causeKey: string): Promise<BalanceMovement | null> {
    return this.movementState.find((movement) => movement.causeKey === causeKey) ?? null;
  }

  async listForOperatingBalance(operatingBalanceId: string, skip: number, limit: number): Promise<BalanceMovement[]> {
    return this.movementState
      .filter((movement) => movement.operatingBalanceId === operatingBalanceId)
      .sort((a, b) => b.sequence - a.sequence)
      .slice(skip, skip + limit);
  }
}

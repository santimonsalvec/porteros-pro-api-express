import type { IDepositRepository } from '../../src/application/features/payments/common/ports.js';
import { CHECK_LEASE_SECONDS, CHECK_LOG_MAX, isSameCheck, Deposit, type DepositCheck } from '../../src/domain/deposits/deposit.js';

export class FakeDepositRepository implements IDepositRepository {
  private readonly state = new Map<string, Deposit>();
  /** What the document keeps beside the entity (admin spec 007): its checks and the check lease. */
  readonly checkLogs = new Map<string, DepositCheck[]>();
  readonly leases = new Map<string, Date>();

  all(): Deposit[] {
    return [...this.state.values()];
  }

  /** Stores (or overwrites) a deposit as is; the store uses it for status changes. */
  put(deposit: Deposit): void {
    this.state.set(deposit.id, deposit);
  }

  async create(deposit: Deposit): Promise<void> {
    if (this.state.has(deposit.id) || this.all().some((existing) => existing.reference === deposit.reference)) {
      throw new Error(`duplicate deposit ${deposit.id}`);
    }
    this.state.set(deposit.id, deposit);
  }

  async getById(id: string): Promise<Deposit | null> {
    return this.state.get(id) ?? null;
  }

  async getByReference(reference: string): Promise<Deposit | null> {
    return this.all().find((deposit) => deposit.reference === reference) ?? null;
  }

  private newestFirst(goalkeeperId: string): Deposit[] {
    return this.all()
      .filter((deposit) => deposit.goalkeeperId === goalkeeperId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  }

  async listForGoalkeeper(goalkeeperId: string, skip: number, limit: number): Promise<Deposit[]> {
    return this.newestFirst(goalkeeperId).slice(skip, skip + limit);
  }

  async countForGoalkeeper(goalkeeperId: string): Promise<number> {
    return this.newestFirst(goalkeeperId).length;
  }

  async findPendingForGoalkeeper(goalkeeperId: string): Promise<Deposit[]> {
    return this.newestFirst(goalkeeperId).filter((deposit) => deposit.status === 'pending');
  }

  async findDueForCheck(now: Date, cap: number): Promise<Deposit[]> {
    return this.all()
      .filter((deposit) => deposit.status === 'pending' && deposit.nextCheckAt !== null && deposit.nextCheckAt <= now)
      .sort((a, b) => a.nextCheckAt!.getTime() - b.nextCheckAt!.getTime())
      .slice(0, cap);
  }

  async scheduleNextCheck(id: string, nextCheckAt: Date, now: Date): Promise<void> {
    const deposit = this.state.get(id);
    if (!deposit || deposit.status !== 'pending') return;
    this.state.set(id, Deposit.rehydrate({ ...deposit.toProps(), nextCheckAt, lastCheckedAt: now, checks: deposit.checks + 1 }));
  }

  async recordCheck(id: string, entry: DepositCheck): Promise<void> {
    if (!this.state.has(id)) return;
    const log = this.checkLogs.get(id) ?? [];
    const last = log.at(-1);
    if (last && isSameCheck(last, entry)) {
      log[log.length - 1] = { ...last, lastAt: entry.lastAt, repeats: last.repeats + 1 };
    } else {
      log.push({ ...entry });
    }
    this.checkLogs.set(id, log.slice(-CHECK_LOG_MAX));
  }

  async acquireCheckLease(id: string, now: Date): Promise<boolean> {
    if (!this.state.has(id)) return false;
    const until = this.leases.get(id);
    if (until && until > now) return false;
    this.leases.set(id, new Date(now.getTime() + CHECK_LEASE_SECONDS * 1000));
    return true;
  }

  async releaseCheckLease(id: string): Promise<void> {
    this.leases.delete(id);
  }
}

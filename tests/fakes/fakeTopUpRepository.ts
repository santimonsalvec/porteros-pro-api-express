import type { ITopUpRepository } from '../../src/application/features/payments/common/ports.js';
import { TopUp } from '../../src/domain/payments/topUp.js';

export class FakeTopUpRepository implements ITopUpRepository {
  private readonly state = new Map<string, TopUp>();

  all(): TopUp[] {
    return [...this.state.values()];
  }

  /** Stores (or overwrites) a top-up as is; the store uses it for status changes. */
  put(topUp: TopUp): void {
    this.state.set(topUp.id, topUp);
  }

  async create(topUp: TopUp): Promise<void> {
    if (this.state.has(topUp.id) || this.all().some((existing) => existing.reference === topUp.reference)) {
      throw new Error(`duplicate top-up ${topUp.id}`);
    }
    this.state.set(topUp.id, topUp);
  }

  async getById(id: string): Promise<TopUp | null> {
    return this.state.get(id) ?? null;
  }

  async getByReference(reference: string): Promise<TopUp | null> {
    return this.all().find((topUp) => topUp.reference === reference) ?? null;
  }

  private newestFirst(goalkeeperId: string): TopUp[] {
    return this.all()
      .filter((topUp) => topUp.goalkeeperId === goalkeeperId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  }

  async listForGoalkeeper(goalkeeperId: string, skip: number, limit: number): Promise<TopUp[]> {
    return this.newestFirst(goalkeeperId).slice(skip, skip + limit);
  }

  async countForGoalkeeper(goalkeeperId: string): Promise<number> {
    return this.newestFirst(goalkeeperId).length;
  }

  async findDueForCheck(now: Date, cap: number): Promise<TopUp[]> {
    return this.all()
      .filter((topUp) => topUp.status === 'pending' && topUp.nextCheckAt !== null && topUp.nextCheckAt <= now)
      .sort((a, b) => a.nextCheckAt!.getTime() - b.nextCheckAt!.getTime())
      .slice(0, cap);
  }

  async scheduleNextCheck(id: string, nextCheckAt: Date, now: Date): Promise<void> {
    const topUp = this.state.get(id);
    if (!topUp || topUp.status !== 'pending') return;
    this.state.set(id, TopUp.rehydrate({ ...topUp.toProps(), nextCheckAt, lastCheckedAt: now, checks: topUp.checks + 1 }));
  }
}

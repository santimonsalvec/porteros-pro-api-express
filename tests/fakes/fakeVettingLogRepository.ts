import type { IVettingLogRepository } from '../../src/application/features/goalkeepers/common/ports.js';
import type { VettingLogEntry } from '../../src/domain/goalkeepers/vettingLogEntry.js';

export class FakeVettingLogRepository implements IVettingLogRepository {
  readonly entries: VettingLogEntry[] = [];

  async append(entry: VettingLogEntry): Promise<void> {
    this.entries.push(entry);
  }

  async listForGoalkeeper(goalkeeperId: string, limit: number): Promise<VettingLogEntry[]> {
    return this.entries
      .filter((entry) => entry.goalkeeperId === goalkeeperId)
      .sort((a, b) => b.at.getTime() - a.at.getTime() || (b.id < a.id ? -1 : 1))
      .slice(0, limit);
  }

  actionsOf(goalkeeperId: string): string[] {
    return this.entries.filter((entry) => entry.goalkeeperId === goalkeeperId).map((entry) => entry.action);
  }
}

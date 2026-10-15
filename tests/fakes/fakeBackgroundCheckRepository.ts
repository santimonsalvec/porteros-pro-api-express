import type { DeletePendingOutcome, IBackgroundCheckRepository } from '../../src/application/features/goalkeepers/common/ports.js';
import type { BackgroundCheck } from '../../src/domain/goalkeepers/backgroundCheck.js';

export class FakeBackgroundCheckRepository implements IBackgroundCheckRepository {
  private readonly checks = new Map<string, BackgroundCheck>();

  seed(check: BackgroundCheck): void {
    this.checks.set(check.id, check);
  }

  all(): BackgroundCheck[] {
    return [...this.checks.values()];
  }

  async add(check: BackgroundCheck): Promise<void> {
    this.checks.set(check.id, check);
  }

  async listForGoalkeeper(goalkeeperId: string): Promise<BackgroundCheck[]> {
    return [...this.checks.values()]
      .filter((check) => check.goalkeeperId === goalkeeperId)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime() || (b.id < a.id ? -1 : 1));
  }

  async findForGoalkeeper(id: string, goalkeeperId: string): Promise<BackgroundCheck | null> {
    const check = this.checks.get(id);
    return check && check.goalkeeperId === goalkeeperId ? check : null;
  }

  async saveReview(check: BackgroundCheck, expectedRevision: number): Promise<'saved' | 'stale'> {
    const current = this.checks.get(check.id);
    if (!current || current.revision !== expectedRevision) return 'stale';
    this.checks.set(check.id, check);
    return 'saved';
  }

  async deletePending(id: string, goalkeeperId: string): Promise<DeletePendingOutcome> {
    const check = await this.findForGoalkeeper(id, goalkeeperId);
    if (!check) return 'not_found';
    if (check.status !== 'pending') return 'reviewed';
    this.checks.delete(id);
    return 'deleted';
  }
}

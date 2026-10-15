import { AccountClosure, OPEN_CLOSURE_STATUSES, type ClosureStatus } from '../../src/domain/accountClosures/accountClosure.js';
import type { ClosureListCriteria, IAccountClosureRepository } from '../../src/application/features/accountClosures/common/ports.js';

export class FakeAccountClosureRepository implements IAccountClosureRepository {
  readonly closures = new Map<string, AccountClosure>();
  /** Make the next `save` lose the race, as when another administrator acted first. */
  failNextSave = false;

  async findById(id: string): Promise<AccountClosure | null> {
    return this.closures.get(id) ?? null;
  }

  async findOpenByUserId(userId: string): Promise<AccountClosure | null> {
    return this.all().find((closure) => closure.userId === userId && closure.isOpen) ?? null;
  }

  async findLatestByUserId(userId: string): Promise<AccountClosure | null> {
    return this.all().filter((closure) => closure.userId === userId).sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0] ?? null;
  }

  async findClosedByUserId(userId: string): Promise<AccountClosure | null> {
    return this.all().find((closure) => closure.userId === userId && closure.status === 'closed') ?? null;
  }

  async openUserIds(userIds: readonly string[]): Promise<Set<string>> {
    return new Set(this.all().filter((closure) => closure.isOpen && userIds.includes(closure.userId)).map((closure) => closure.userId));
  }

  async add(closure: AccountClosure): Promise<'added' | 'already_open'> {
    if (this.all().some((other) => other.userId === closure.userId && other.isOpen)) return 'already_open';
    this.closures.set(closure.id, closure);
    return 'added';
  }

  async save(closure: AccountClosure, expectedStatus: ClosureStatus): Promise<boolean> {
    const current = this.closures.get(closure.id);
    if (this.failNextSave) {
      this.failNextSave = false;
      return false;
    }
    if (!current || current.status !== expectedStatus) return false;
    this.closures.set(closure.id, closure);
    return true;
  }

  async list(criteria: ClosureListCriteria): Promise<{ items: AccountClosure[]; totalItems: number }> {
    const matching = this.all()
      .filter((closure) => criteria.statuses.includes(closure.status))
      .filter((closure) => criteria.userIds === null || criteria.userIds.includes(closure.userId))
      .filter((closure) => criteria.debt === null || ((closure.balanceAtRequest ?? 0) < 0) === (criteria.debt === 'with'))
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
    const skip = (criteria.page - 1) * criteria.pageSize;
    return { items: matching.slice(skip, skip + criteria.pageSize), totalItems: matching.length };
  }

  /** Test helper: a closure that is open. */
  static readonly open = OPEN_CLOSURE_STATUSES;

  private all(): AccountClosure[] {
    return [...this.closures.values()];
  }
}

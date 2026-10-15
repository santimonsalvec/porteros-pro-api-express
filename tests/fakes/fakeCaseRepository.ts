import type { CaseListFilter, ICaseRepository } from '../../src/application/features/cases/common/ports.js';
import type { CaseResolution, CaseStatus, SupportCase } from '../../src/domain/cases/case.js';

/** Reads and resolves the cases the fake lifecycle store opens. */
export class FakeCaseRepository implements ICaseRepository {
  constructor(private readonly cases: { all(): SupportCase[]; replace(item: SupportCase): void }) {}

  private sorted(status: CaseStatus | null): SupportCase[] {
    return this.cases
      .all()
      .filter((item) => status === null || item.status === status)
      .sort((a, b) => a.status.localeCompare(b.status) || b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
  }

  async list(status: CaseStatus | null, skip: number, limit: number): Promise<SupportCase[]> {
    return this.sorted(status).slice(skip, skip + limit);
  }

  async count(status: CaseStatus | null): Promise<number> {
    return this.sorted(status).length;
  }

  async getById(id: string): Promise<SupportCase | null> {
    return this.cases.all().find((item) => item.id === id) ?? null;
  }

  async resolve(id: string, resolution: CaseResolution): Promise<'resolved' | 'already_resolved' | 'not_found'> {
    const item = this.cases.all().find((candidate) => candidate.id === id);
    if (!item) return 'not_found';
    if (item.status === 'resolved') return 'already_resolved';
    this.cases.replace(item.resolve(resolution));
    return 'resolved';
  }

  /** The admin's search, filtering and ordering like the Mongo repository (admin spec 006). */
  private matching(filter: CaseListFilter): SupportCase[] {
    const kept = this.cases
      .all()
      .filter((item) => !filter.status || item.status === filter.status)
      .filter((item) => !filter.type || item.type === filter.type)
      .filter((item) => !filter.from || item.createdAt.getTime() >= filter.from.getTime())
      .filter((item) => !filter.to || item.createdAt.getTime() < filter.to.getTime())
      .filter((item) => !filter.requestIds || filter.requestIds.includes(item.requestId));
    return filter.order === 'oldest'
      ? kept.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1))
      : kept.sort((a, b) => a.status.localeCompare(b.status) || b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
  }

  async search(filter: CaseListFilter, skip: number, limit: number): Promise<SupportCase[]> {
    return this.matching(filter).slice(skip, skip + limit);
  }

  async countMatching(filter: CaseListFilter): Promise<number> {
    return this.matching(filter).length;
  }

  async findOpenForParticipant(userId: string): Promise<SupportCase[]> {
    return this.cases.all().filter((item) => item.status === 'open' && (item.goalkeeperId === userId || item.clientId === userId));
  }

  async requestIdsMatching(filter: CaseListFilter): Promise<string[]> {
    return [...new Set(this.matching(filter).map((item) => item.requestId))];
  }
}

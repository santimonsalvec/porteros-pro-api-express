import type { ICaseRepository } from '../../src/application/features/cases/common/ports.js';
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
}

import type { ITopUpAdminReader, TopUpAdminFilter, TopUpAdminRecord } from '../../src/application/features/payments/common/adminPorts.js';
import type { TopUp } from '../../src/domain/payments/topUp.js';
import type { FakeTopUpRepository } from './fakeTopUpRepository.js';

/** The admin's top-up reads over the fake repository, filtered in memory like the Mongo reader. */
export class FakeTopUpAdminReader implements ITopUpAdminReader {
  constructor(private readonly topUps: FakeTopUpRepository) {}

  private matching(filter: TopUpAdminFilter): TopUp[] {
    return this.topUps
      .all()
      .filter((topUp) => !filter.status || topUp.status === filter.status)
      .filter((topUp) => !filter.countryId || topUp.countryId === filter.countryId)
      .filter((topUp) => !filter.goalkeeperId || topUp.goalkeeperId === filter.goalkeeperId)
      .filter((topUp) => !filter.from || topUp.createdAt >= filter.from)
      .filter((topUp) => !filter.to || topUp.createdAt < filter.to)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  }

  async list(filter: TopUpAdminFilter & { page: number; pageSize: number }) {
    const all = this.matching(filter);
    return { items: all.slice((filter.page - 1) * filter.pageSize, filter.page * filter.pageSize), totalItems: all.length };
  }

  async count(filter: TopUpAdminFilter): Promise<number> {
    return this.matching(filter).length;
  }

  async all(filter: TopUpAdminFilter, limit: number): Promise<TopUp[]> {
    return this.matching(filter).slice(0, limit);
  }

  async get(topUpId: string): Promise<TopUpAdminRecord | null> {
    const topUp = await this.topUps.getById(topUpId);
    return topUp ? { topUp, checkLog: this.topUps.checkLogs.get(topUpId) ?? [] } : null;
  }
}

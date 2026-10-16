import type { IDepositAdminReader, DepositAdminFilter, DepositAdminRecord } from '../../src/application/features/payments/common/adminPorts.js';
import type { Deposit } from '../../src/domain/deposits/deposit.js';
import type { FakeDepositRepository } from './fakeDepositRepository.js';

/** The admin's deposit reads over the fake repository, filtered in memory like the Mongo reader. */
export class FakeDepositAdminReader implements IDepositAdminReader {
  constructor(private readonly deposits: FakeDepositRepository) {}

  private matching(filter: DepositAdminFilter): Deposit[] {
    return this.deposits
      .all()
      .filter((deposit) => !filter.status || deposit.status === filter.status)
      .filter((deposit) => !filter.countryId || deposit.countryId === filter.countryId)
      .filter((deposit) => !filter.marketIds || filter.marketIds.includes(deposit.marketId))
      .filter((deposit) => !filter.goalkeeperId || deposit.goalkeeperId === filter.goalkeeperId)
      .filter((deposit) => !filter.from || deposit.createdAt >= filter.from)
      .filter((deposit) => !filter.to || deposit.createdAt < filter.to)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  }

  async list(filter: DepositAdminFilter & { page: number; pageSize: number }) {
    const all = this.matching(filter);
    return { items: all.slice((filter.page - 1) * filter.pageSize, filter.page * filter.pageSize), totalItems: all.length };
  }

  async count(filter: DepositAdminFilter): Promise<number> {
    return this.matching(filter).length;
  }

  async all(filter: DepositAdminFilter, limit: number): Promise<Deposit[]> {
    return this.matching(filter).slice(0, limit);
  }

  async get(depositId: string): Promise<DepositAdminRecord | null> {
    const deposit = await this.deposits.getById(depositId);
    return deposit ? { deposit, checkLog: this.deposits.checkLogs.get(depositId) ?? [] } : null;
  }
}

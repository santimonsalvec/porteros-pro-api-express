import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { pageOf } from '../../../geography/common/views.js';
import type { UserListRecord } from '../../common/ports.js';
import type { UsersQueryDependencies } from '../../common/usersQueryDependencies.js';
import { countryCodesByDialCode, userName } from '../../common/userViewing.js';
import type { UserRow } from '../../common/views.js';
import { ListUsersQuery, type ListUsersResult } from './listUsersQuery.js';

/** Sign-up days are cut on Colombia's clock (UTC−5, no daylight saving). */
const COLOMBIA_OFFSET = '-05:00';
const DAY_MS = 24 * 60 * 60 * 1000;

export class ListUsersQueryHandler implements IQueryHandler<ListUsersQuery, ListUsersResult> {
  constructor(private readonly deps: UsersQueryDependencies) {}

  async handle({ criteria }: ListUsersQuery): Promise<ListUsersResult> {
    const countries = await this.deps.countries.getAll();
    let countryCallingCode: string | undefined;
    const wanted = criteria.countryCode?.toUpperCase();
    if (wanted !== undefined) {
      countryCallingCode = countries.find((country) => country.countryCode === wanted)?.dialCode;
      if (!countryCallingCode) return pageOf([], criteria.page, criteria.pageSize, 0);
    }
    const { items, totalItems } = await this.deps.reader.list({
      q: criteria.q,
      role: criteria.role,
      countryCallingCode,
      createdFrom: criteria.createdFrom ? dayStart(criteria.createdFrom) : undefined,
      createdTo: criteria.createdTo ? new Date(dayStart(criteria.createdTo).getTime() + DAY_MS) : undefined,
      blocked: criteria.blocked,
      page: criteria.page,
      pageSize: criteria.pageSize,
    });
    const codes = countryCodesByDialCode(countries);
    return pageOf(items.map((record) => userRow(record, codes)), criteria.page, criteria.pageSize, totalItems);
  }
}

function dayStart(day: string): Date {
  return new Date(`${day}T00:00:00${COLOMBIA_OFFSET}`);
}

export function userRow(record: UserListRecord, codes: Map<string, string>): UserRow {
  return {
    id: record.id,
    name: userName(record),
    email: record.email,
    countryCode: record.countryCallingCode ? (codes.get(record.countryCallingCode) ?? null) : null,
    createdAt: record.createdAt.toISOString(),
    isProfileComplete: record.isProfileComplete,
    isGoalkeeper: record.isGoalkeeper,
    blocked: record.blocked,
  };
}

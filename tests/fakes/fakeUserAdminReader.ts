import type { IUserAdminReader, ScheduledRecord, UserListFilter, UserListRecord } from '../../src/application/features/users/common/ports.js';
import { userSearchMatch } from '../../src/application/features/users/common/userSearch.js';
import type { User } from '../../src/domain/users/user.js';
import type { FakeUserRepository } from './fakeUserRepository.js';
import type { FakeGoalkeeperProfileRepository } from './fakeGoalkeeperProfileRepository.js';
import type { FakeUserBlockRepository } from './fakeUserBlockRepository.js';
import type { FakeTermsAcceptanceRepository } from './fakeTermsAcceptanceRepository.js';
import type { FakeDeviceRepository } from './fakeDeviceRepository.js';
import type { FakeGoalkeeperRequestRepository } from './fakeGoalkeeperRequestRepository.js';
import type { FakeBookingRepository } from './fakeBookingRepository.js';
import { matchesDocument } from './fakeMongoMatch.js';

/** The admin's user reads over the in-memory stores, filtering like the Mongo reader. */
export class FakeUserAdminReader implements IUserAdminReader {
  constructor(
    private readonly stores: {
      users: FakeUserRepository;
      profiles: FakeGoalkeeperProfileRepository;
      blocks: FakeUserBlockRepository;
      terms: FakeTermsAcceptanceRepository;
      devices: FakeDeviceRepository;
      requests: FakeGoalkeeperRequestRepository;
      bookings: FakeBookingRepository;
    },
  ) {}

  async list(filter: UserListFilter): Promise<{ items: UserListRecord[]; totalItems: number }> {
    const records = await Promise.all((await this.searched(filter.q)).map((user) => this.record(user)));
    const kept = records
      .filter((record) => filter.role === undefined || record.isGoalkeeper === (filter.role === 'goalkeeper'))
      .filter((record) => filter.countryCallingCode === undefined || record.countryCallingCode === filter.countryCallingCode)
      .filter((record) => !filter.createdFrom || record.createdAt >= filter.createdFrom)
      .filter((record) => !filter.createdTo || record.createdAt < filter.createdTo)
      .filter((record) => filter.blocked === undefined || record.blocked === filter.blocked)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
    const start = (filter.page - 1) * filter.pageSize;
    return { items: kept.slice(start, start + filter.pageSize), totalItems: kept.length };
  }

  async findIds(q: string, limit: number): Promise<string[]> {
    return (await this.searched(q)).slice(0, limit).map((user) => user.id);
  }

  async terms(userId: string): Promise<{ version: string; acceptedAt: Date }[]> {
    return (await this.stores.terms.getAll())
      .filter((terms) => terms.userId === userId)
      .sort((a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime())
      .map((terms) => ({ version: terms.termsVersion, acceptedAt: terms.acceptedAt }));
  }

  async devices(userId: string): Promise<{ platform: string; lastSeenAt: Date }[]> {
    return (await this.stores.devices.findByUserIds([userId]))
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .map((device) => ({ platform: device.platform, lastSeenAt: device.lastSeenAt }));
  }

  async requestCount(userId: string): Promise<number> {
    return this.stores.requests.all().filter((request) => request.clientId === userId).length;
  }

  async openRequests(userId: string, now: Date, limit: number): Promise<{ total: number; items: ScheduledRecord[] }> {
    const open = new Set(
      this.stores.bookings.all().filter((booking) => booking.status === 'pending_assignment' || booking.status === 'assigned').map((booking) => booking.requestId),
    );
    const requests = this.stores.requests
      .all()
      .filter((request) => request.clientId === userId && request.startsAt > now && open.has(request.id))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    return { total: requests.length, items: requests.slice(0, limit).map((request) => ({ id: request.id, startsAt: request.startsAt, zoneId: request.zoneId })) };
  }

  private async searched(q: string | undefined): Promise<User[]> {
    const users = await this.stores.users.getAll();
    const match = q ? userSearchMatch(q) : null;
    return match ? users.filter((user) => matchesDocument(match, user as unknown as Record<string, unknown>)) : users;
  }

  private async record(user: User): Promise<UserListRecord> {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      email: user.email,
      countryCallingCode: user.countryCallingCode,
      createdAt: user.createdAt,
      isProfileComplete: user.isProfileComplete,
      isGoalkeeper: (await this.stores.profiles.getByUserId(user.id)) !== null,
      blocked: (await this.stores.blocks.findByUserId(user.id))?.blocked ?? false,
    };
  }
}

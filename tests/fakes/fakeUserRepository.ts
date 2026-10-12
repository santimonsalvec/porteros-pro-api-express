import type { ContactFields, ContactWriteResult, IUserContactWriter } from '../../src/application/features/users/common/ports.js';
import type { IUserRepository } from '../../src/application/features/auth/common/ports.js';
import { User } from '../../src/domain/users/user.js';

export class FakeUserRepository implements IUserRepository, IUserContactWriter {
  private readonly users = new Map<string, User>();
  updateCalled = false;

  seed(user: User): void {
    this.users.set(user.id, user);
  }

  async getAll(): Promise<User[]> {
    return [...this.users.values()];
  }

  async getById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async add(entity: User): Promise<void> {
    this.users.set(entity.id, entity);
  }

  async update(entity: User): Promise<void> {
    this.updateCalled = true;
    this.users.set(entity.id, entity);
  }

  async delete(id: string): Promise<void> {
    this.users.delete(id);
  }

  async getByIds(ids: string[]): Promise<User[]> {
    return ids.flatMap((id) => this.users.get(id) ?? []);
  }

  async findByExternalIdentity(provider: string, subject: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.findExternalIdentity(provider, subject)) return user;
    }
    return null;
  }

  async existsByPhoneNumber(
    countryCallingCode: string,
    whatsAppNumber: string,
    excludeUserId?: string,
  ): Promise<boolean> {
    const normalized = User.normalizePhoneNumber(countryCallingCode, whatsAppNumber);
    for (const user of this.users.values()) {
      if (excludeUserId && user.id === excludeUserId) continue;
      if (user.normalizedPhoneNumber === normalized) return true;
    }
    return false;
  }

  /** Like the Mongo writer: only if the user still has the values read; the phone stays unique. */
  async updateContactIfUnchanged(userId: string, expected: Omit<ContactFields, 'whatsAppNumber'>, next: ContactFields): Promise<ContactWriteResult> {
    const user = this.users.get(userId);
    if (!user || (Object.keys(expected) as (keyof typeof expected)[]).some((key) => user[key] !== expected[key])) return 'stale';
    for (const other of this.users.values()) {
      if (other.id !== userId && next.normalizedPhoneNumber !== null && other.normalizedPhoneNumber === next.normalizedPhoneNumber) return 'duplicate';
    }
    Object.assign(user, next);
    return 'saved';
  }
}

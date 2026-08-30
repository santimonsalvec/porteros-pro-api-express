import type { IUserRepository } from '../../src/application/features/auth/common/ports.js';
import { User } from '../../src/domain/users/user.js';

export class FakeUserRepository implements IUserRepository {
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
}

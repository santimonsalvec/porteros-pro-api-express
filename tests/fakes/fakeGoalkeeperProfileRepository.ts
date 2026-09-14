import type { IGoalkeeperProfileRepository } from '../../src/application/features/goalkeepers/common/ports.js';
import { GoalkeeperProfile } from '../../src/domain/goalkeepers/goalkeeperProfile.js';

export class FakeGoalkeeperProfileRepository implements IGoalkeeperProfileRepository {
  private readonly profiles = new Map<string, GoalkeeperProfile>();

  seed(profile: GoalkeeperProfile): void {
    this.profiles.set(profile.id, profile);
  }

  async getAll(): Promise<GoalkeeperProfile[]> {
    return [...this.profiles.values()];
  }

  async getById(id: string): Promise<GoalkeeperProfile | null> {
    return this.profiles.get(id) ?? null;
  }

  async add(entity: GoalkeeperProfile): Promise<void> {
    this.profiles.set(entity.id, entity);
  }

  async update(entity: GoalkeeperProfile): Promise<void> {
    this.profiles.set(entity.id, entity);
  }

  async delete(id: string): Promise<void> {
    this.profiles.delete(id);
  }

  async getByUserId(userId: string): Promise<GoalkeeperProfile | null> {
    for (const profile of this.profiles.values()) {
      if (profile.userId === userId) return profile;
    }
    return null;
  }
}

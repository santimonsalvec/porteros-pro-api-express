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

  async updatePhysicalData(userId: string, fields: { heightCm?: number; weightKg?: number }): Promise<GoalkeeperProfile | null> {
    return this.patch(userId, {
      ...(fields.heightCm !== undefined ? { heightCm: fields.heightCm } : {}),
      ...(fields.weightKg !== undefined ? { weightKg: fields.weightKg } : {}),
    });
  }

  async updateAvailability(userId: string, cityId: string, zoneIds: string[]): Promise<GoalkeeperProfile | null> {
    return this.patch(userId, { cityId, zoneIds });
  }

  /**
   * Like `findOneAndUpdate` + `$set`: merges only the given keys into whatever is stored
   * *right now*, and does the read and the write in one synchronous step (no `await`
   * in between) so two overlapping updates can never lose each other's fields.
   */
  private async patch(userId: string, changes: Partial<GoalkeeperProfile>): Promise<GoalkeeperProfile | null> {
    const current = [...this.profiles.values()].find((profile) => profile.userId === userId);
    if (!current) return null;
    const updated = new GoalkeeperProfile({ ...current, ...changes });
    this.profiles.set(updated.id, updated);
    return updated;
  }
}

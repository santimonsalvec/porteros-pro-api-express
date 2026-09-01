import type { IPorteroProfileRepository } from '../../src/application/features/porteros/common/ports.js';
import { PorteroProfile } from '../../src/domain/porteros/porteroProfile.js';

export class FakePorteroProfileRepository implements IPorteroProfileRepository {
  private readonly profiles = new Map<string, PorteroProfile>();

  seed(profile: PorteroProfile): void {
    this.profiles.set(profile.id, profile);
  }

  async getAll(): Promise<PorteroProfile[]> {
    return [...this.profiles.values()];
  }

  async getById(id: string): Promise<PorteroProfile | null> {
    return this.profiles.get(id) ?? null;
  }

  async add(entity: PorteroProfile): Promise<void> {
    this.profiles.set(entity.id, entity);
  }

  async update(entity: PorteroProfile): Promise<void> {
    this.profiles.set(entity.id, entity);
  }

  async delete(id: string): Promise<void> {
    this.profiles.delete(id);
  }

  async getByUserId(userId: string): Promise<PorteroProfile | null> {
    for (const profile of this.profiles.values()) {
      if (profile.userId === userId) return profile;
    }
    return null;
  }
}

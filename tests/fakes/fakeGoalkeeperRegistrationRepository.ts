import type { RegistrationListFilter } from '../../src/application/features/goalkeepers/common/adminPorts.js';
import type { IGoalkeeperRegistrationRepository } from '../../src/application/features/goalkeepers/common/ports.js';
import { GoalkeeperRegistration } from '../../src/domain/goalkeepers/goalkeeperRegistration.js';

export class FakeGoalkeeperRegistrationRepository implements IGoalkeeperRegistrationRepository {
  private readonly registrations = new Map<string, GoalkeeperRegistration>();

  seed(registration: GoalkeeperRegistration): void {
    this.registrations.set(registration.id, registration);
  }

  async getAll(): Promise<GoalkeeperRegistration[]> {
    return [...this.registrations.values()];
  }

  async getById(id: string): Promise<GoalkeeperRegistration | null> {
    return this.registrations.get(id) ?? null;
  }

  async add(entity: GoalkeeperRegistration): Promise<void> {
    this.registrations.set(entity.id, entity);
  }

  async update(entity: GoalkeeperRegistration): Promise<void> {
    this.registrations.set(entity.id, entity);
  }

  async delete(id: string): Promise<void> {
    this.registrations.delete(id);
  }

  async getByUserId(userId: string): Promise<GoalkeeperRegistration | null> {
    for (const registration of this.registrations.values()) {
      if (registration.userId === userId) return registration;
    }
    return null;
  }

  async existsByDocument(documentType: string, documentNumber: string, excludeUserId?: string): Promise<boolean> {
    for (const registration of this.registrations.values()) {
      if (excludeUserId && registration.userId === excludeUserId) continue;
      if (
        registration.identification.documentType === documentType &&
        registration.identification.documentNumber === documentNumber
      ) {
        return true;
      }
    }
    return false;
  }

  /** Like the Mongo reader: not activated, longest idle first (admin spec 005). */
  async inProgress(filter: RegistrationListFilter): Promise<GoalkeeperRegistration[]> {
    return [...this.registrations.values()]
      .filter((registration) => registration.status === 'in_progress')
      .filter((registration) => filter.cityId === undefined || registration.availability.cityId === filter.cityId)
      .filter((registration) => !filter.updatedBefore || registration.updatedAt <= filter.updatedBefore)
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  }
}

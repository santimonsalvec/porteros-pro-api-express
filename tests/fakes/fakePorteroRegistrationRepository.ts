import type { IPorteroRegistrationRepository } from '../../src/application/features/porteros/common/ports.js';
import { PorteroRegistration } from '../../src/domain/porteros/porteroRegistration.js';

export class FakePorteroRegistrationRepository implements IPorteroRegistrationRepository {
  private readonly registrations = new Map<string, PorteroRegistration>();

  seed(registration: PorteroRegistration): void {
    this.registrations.set(registration.id, registration);
  }

  async getAll(): Promise<PorteroRegistration[]> {
    return [...this.registrations.values()];
  }

  async getById(id: string): Promise<PorteroRegistration | null> {
    return this.registrations.get(id) ?? null;
  }

  async add(entity: PorteroRegistration): Promise<void> {
    this.registrations.set(entity.id, entity);
  }

  async update(entity: PorteroRegistration): Promise<void> {
    this.registrations.set(entity.id, entity);
  }

  async delete(id: string): Promise<void> {
    this.registrations.delete(id);
  }

  async getByUserId(userId: string): Promise<PorteroRegistration | null> {
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
}

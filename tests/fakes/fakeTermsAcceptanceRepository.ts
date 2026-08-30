import type { ITermsAcceptanceRepository } from '../../src/application/features/profile/common/ports.js';
import { TermsAcceptance } from '../../src/domain/users/termsAcceptance.js';

export class FakeTermsAcceptanceRepository implements ITermsAcceptanceRepository {
  readonly records: TermsAcceptance[] = [];

  async getAll(): Promise<TermsAcceptance[]> {
    return [...this.records];
  }

  async getById(id: string): Promise<TermsAcceptance | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }

  async add(entity: TermsAcceptance): Promise<void> {
    this.records.push(entity);
  }

  async update(): Promise<void> {
    throw new Error('TermsAcceptance records are append-only.');
  }

  async delete(): Promise<void> {
    throw new Error('TermsAcceptance records are append-only.');
  }
}

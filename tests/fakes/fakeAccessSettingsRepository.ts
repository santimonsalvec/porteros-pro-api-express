import type { IAccessSettingsRepository } from '../../src/application/features/auth/common/ports.js';
import type { StoredAccessSettings } from '../../src/domain/auth/accessSettings.js';

/** The one access configuration in memory, saved at a revision like the Mongo one. */
export class FakeAccessSettingsRepository implements IAccessSettingsRepository {
  stored: StoredAccessSettings | null = null;

  async get(): Promise<StoredAccessSettings | null> {
    return this.stored ? { ...this.stored } : null;
  }

  async create(settings: Omit<StoredAccessSettings, 'revision'>): Promise<'saved' | 'stale'> {
    if (this.stored) return 'stale';
    this.stored = { ...settings, revision: 0 };
    return 'saved';
  }

  async update(settings: Omit<StoredAccessSettings, 'revision'>, expectedRevision: number): Promise<'saved' | 'stale'> {
    if (!this.stored || this.stored.revision !== expectedRevision) return 'stale';
    this.stored = { ...settings, revision: expectedRevision + 1 };
    return 'saved';
  }
}

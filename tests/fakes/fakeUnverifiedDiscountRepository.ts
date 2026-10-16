import type { DiscountCreateResult, DiscountDeleteResult, IUnverifiedDiscountRepository, UnverifiedFields } from '../../src/application/features/pricing/common/ports.js';
import { UnverifiedDiscountSetting } from '../../src/domain/pricing/unverifiedDiscount.js';

export class FakeUnverifiedDiscountRepository implements IUnverifiedDiscountRepository {
  readonly items = new Map<string, UnverifiedDiscountSetting>();

  seed(scope: string, refId: string, discountBps: number | null, id = `${scope}-${refId}`, verifiedPriorityMinutes: number | null = null): UnverifiedDiscountSetting {
    const setting = new UnverifiedDiscountSetting({ id, scope, refId, discountBps, verifiedPriorityMinutes });
    this.items.set(id, setting);
    return setting;
  }

  async findFor(refs: { zoneIds: string[]; marketIds: string[]; countryIds: string[] }): Promise<UnverifiedDiscountSetting[]> {
    return [...this.items.values()].filter(
      (setting) =>
        (setting.scope === 'zone' && refs.zoneIds.includes(setting.refId)) ||
        (setting.scope === 'market' && refs.marketIds.includes(setting.refId)) ||
        (setting.scope === 'country' && refs.countryIds.includes(setting.refId)),
    );
  }

  async getById(id: string): Promise<UnverifiedDiscountSetting | null> {
    return this.items.get(id) ?? null;
  }

  async create(setting: { id: string; scope: string; refId: string } & UnverifiedFields): Promise<DiscountCreateResult> {
    const existing = [...this.items.values()].find((item) => item.scope === setting.scope && item.refId === setting.refId);
    if (existing) return { outcome: 'duplicate', existingId: existing.id };
    this.items.set(setting.id, new UnverifiedDiscountSetting(setting));
    return { outcome: 'created' };
  }

  async update(id: string, expectedRevision: number, fields: UnverifiedFields): Promise<'saved' | 'stale'> {
    const current = this.items.get(id);
    if (!current || current.revision !== expectedRevision) return 'stale';
    this.items.set(id, new UnverifiedDiscountSetting({ ...current, ...fields, revision: current.revision + 1 }));
    return 'saved';
  }

  async delete(id: string, expectedRevision: number): Promise<DiscountDeleteResult> {
    const current = this.items.get(id);
    if (!current) return 'not_found';
    if (current.revision !== expectedRevision) return 'stale';
    this.items.delete(id);
    return 'deleted';
  }
}

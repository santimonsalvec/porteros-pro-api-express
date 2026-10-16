import type { UpdateResult } from '../../src/application/features/geography/common/ports.js';
import type { CreateResult, PriceFilter, PriceRecord } from '../../src/application/features/pricing/common/ports.js';

/** What the rate and commission fakes share: an admin's view of their entities (spec 004 of the admin). */
interface PriceEntity {
  id: string;
  scope: string;
  refId: string;
  modality: string | null;
  amount: number;
  revision: number;
}

export function matchesPriceFilter(entity: PriceEntity, filter: PriceFilter): boolean {
  if (filter.refs !== null && !filter.refs.some((ref) => ref.scope === entity.scope && ref.refIds.includes(entity.refId))) return false;
  if (filter.modality !== undefined && entity.modality !== (filter.modality === 'general' ? null : filter.modality)) return false;
  return true;
}

export function priceRecord<Scope extends string>(entity: PriceEntity): PriceRecord<Scope> {
  return {
    id: entity.id,
    scope: entity.scope as Scope,
    refId: entity.refId,
    modality: entity.modality as PriceRecord<Scope>['modality'],
    amount: entity.amount,
    revision: entity.revision,
    invalid: false,
  };
}

/** The unique index of feature 024, in memory. */
export function createIn<T extends PriceEntity>(items: T[], candidate: T, sameIdentity: (a: T, b: T) => boolean): CreateResult {
  const existing = items.find((item) => sameIdentity(item, candidate));
  if (existing) return { outcome: 'duplicate', existingId: existing.id };
  items.push(candidate);
  return { outcome: 'created' };
}

export function updateIn<T extends PriceEntity>(items: T[], id: string, expectedRevision: number, rebuild: (item: T) => T): UpdateResult {
  const index = items.findIndex((item) => item.id === id);
  const current = items[index];
  if (current === undefined || current.revision !== expectedRevision) return 'stale';
  items[index] = rebuild(current);
  return 'saved';
}

export function deleteIn<T extends PriceEntity>(items: T[], id: string): boolean {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return false;
  items.splice(index, 1);
  return true;
}

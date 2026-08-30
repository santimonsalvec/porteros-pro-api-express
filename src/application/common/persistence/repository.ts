import type { Entity } from '../../../domain/common/entity.js';

/**
 * Provider-agnostic data-access abstraction. Application-layer code depends only on
 * this interface, never on a MongoDB-driver type (FR-002, SC-003).
 */
export interface IRepository<TEntity extends Entity<TId>, TId> {
  getAll(): Promise<TEntity[]>;
  getById(id: TId): Promise<TEntity | null>;
  add(entity: TEntity): Promise<void>;
  update(entity: TEntity): Promise<void>;
  delete(id: TId): Promise<void>;
}

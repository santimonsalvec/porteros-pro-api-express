import { Entity } from '../common/entity.js';
import { readRevision } from '../common/revision.js';

/** A market's life (spec 031, FR-007–FR-009): it never goes back to `draft`. */
export const MARKET_STATUSES = ['draft', 'enabled', 'disabled'] as const;
export type MarketStatus = (typeof MARKET_STATUSES)[number];

export const MARKET_NAME_MIN = 2;
export const MARKET_NAME_MAX = 60;

export interface MarketProps {
  id: string;
  name: string;
  countryId: string;
  timeZone: string;
  status: MarketStatus;
  enabledAt: Date | null;
  enabledBy: string | null;
  disabledAt: Date | null;
  disabledBy: string | null;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  revision?: number;
}

export class MarketTransitionError extends Error {}

/** Case-, accent- and space-insensitive form of a name, for the per-country uniqueness index. */
export function nameKeyOf(name: string): string {
  return name.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * The fields that break the market's rules, by name; empty when they are all valid. The time
 * zone is only checked for presence here: whether the runtime knows it is the command's check.
 */
export function marketFieldIssues(fields: { name: string; countryId: string; timeZone: string }): string[] {
  const issues: string[] = [];
  const name = fields.name.trim();
  if (name.length < MARKET_NAME_MIN || name.length > MARKET_NAME_MAX) issues.push('name');
  if (fields.countryId.trim() === '') issues.push('countryId');
  if (fields.timeZone.trim() === '') issues.push('timeZone');
  return issues;
}

/**
 * Where PorterosPRO operates (spec 031): a group of zones drawn in the admin, with its own
 * settings that inherit from its country. Its country never changes (FR-001a).
 */
export class Market extends Entity<string> {
  readonly name: string;
  readonly countryId: string;
  readonly timeZone: string;
  readonly status: MarketStatus;
  readonly enabledAt: Date | null;
  readonly enabledBy: string | null;
  readonly disabledAt: Date | null;
  readonly disabledBy: string | null;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly revision: number;

  private constructor(props: MarketProps) {
    super(props.id);
    this.name = props.name.trim();
    this.countryId = props.countryId;
    this.timeZone = props.timeZone;
    this.status = props.status;
    this.enabledAt = props.enabledAt;
    this.enabledBy = props.enabledBy;
    this.disabledAt = props.disabledAt;
    this.disabledBy = props.disabledBy;
    this.createdAt = props.createdAt;
    this.createdBy = props.createdBy;
    this.updatedAt = props.updatedAt;
    this.revision = readRevision(props.revision, `markets document ${props.id}`);
  }

  static create(
    params: { id: string; name: string; countryId: string; timeZone: string; createdBy: string },
    now: Date,
  ): Market {
    return new Market({
      ...params,
      status: 'draft',
      enabledAt: null,
      enabledBy: null,
      disabledAt: null,
      disabledBy: null,
      createdAt: now,
      updatedAt: now,
      revision: 0,
    });
  }

  static fromStored(props: MarketProps): Market {
    return new Market(props);
  }

  get nameKey(): string {
    return nameKeyOf(this.name);
  }

  toProps(): MarketProps {
    return {
      id: this.id,
      name: this.name,
      countryId: this.countryId,
      timeZone: this.timeZone,
      status: this.status,
      enabledAt: this.enabledAt,
      enabledBy: this.enabledBy,
      disabledAt: this.disabledAt,
      disabledBy: this.disabledBy,
      createdAt: this.createdAt,
      createdBy: this.createdBy,
      updatedAt: this.updatedAt,
      revision: this.revision,
    };
  }

  /** From `draft` or `disabled`; the readiness check is the caller's (FR-008). */
  enable(by: string, now: Date): Market {
    if (this.status === 'enabled') throw new MarketTransitionError(`Market ${this.id} is already enabled`);
    return new Market({ ...this.toProps(), status: 'enabled', enabledAt: now, enabledBy: by, updatedAt: now });
  }

  disable(by: string, now: Date): Market {
    if (this.status !== 'enabled') throw new MarketTransitionError(`Market ${this.id} is not enabled`);
    return new Market({ ...this.toProps(), status: 'disabled', disabledAt: now, disabledBy: by, updatedAt: now });
  }

  /** The editable fields; the country is not one of them. */
  withEdits(edits: { name?: string; timeZone?: string }, now: Date = this.updatedAt): Market {
    return new Market({
      ...this.toProps(),
      name: edits.name ?? this.name,
      timeZone: edits.timeZone ?? this.timeZone,
      updatedAt: now,
    });
  }
}

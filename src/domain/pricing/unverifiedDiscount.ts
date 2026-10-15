import { readRevision } from '../common/revision.js';
import { InvalidConfigurationError } from './invalidConfigurationError.js';

export type UnverifiedDiscountScope = 'country' | 'city' | 'zone';
const SCOPES: readonly string[] = ['country', 'city', 'zone'];

/** The platform's ceiling for the discount (admin spec 030, clarification 3): 30 %. */
export const MAX_UNVERIFIED_DISCOUNT_BPS = 3000;
/** How long a new booking waits for verified goalkeepers when no level says (research §5). */
export const VERIFIED_PRIORITY_MINUTES_DEFAULT = 15;
export const MAX_VERIFIED_PRIORITY_MINUTES = 1440;

/**
 * How goalkeepers without the verification seal are treated at a country, an anchor city or a
 * zone (admin spec 030): how much less the client pays — and the goalkeeper earns — when one takes
 * the match (FR-017/FR-018, basis points), and how long a new booking is offered only to verified
 * goalkeepers first (FR-015). Each value is optional (`null` = inherit); the most specific level
 * that sets it applies.
 */
export class UnverifiedDiscountSetting {
  readonly id: string;
  readonly scope: UnverifiedDiscountScope;
  /** A `Country` id, an anchor `City` id or a `Zone` id, per `scope`. */
  readonly refId: string;
  readonly discountBps: number | null;
  readonly verifiedPriorityMinutes: number | null;
  /** Optimistic-concurrency counter of the admin web (absent = 0). */
  readonly revision: number;

  constructor(params: { id: string; scope: string; refId: string; discountBps?: number | null; verifiedPriorityMinutes?: number | null; revision?: number }) {
    const where = `unverifiedDiscounts document ${params.id}`;
    if (!SCOPES.includes(params.scope)) throw new InvalidConfigurationError(`${where}: unknown scope '${params.scope}'`);
    if (typeof params.refId !== 'string' || params.refId === '') throw new InvalidConfigurationError(`${where}: refId is required`);
    const discountBps = params.discountBps ?? null;
    const verifiedPriorityMinutes = params.verifiedPriorityMinutes ?? null;
    if (discountBps !== null && (!Number.isInteger(discountBps) || discountBps < 0)) {
      throw new InvalidConfigurationError(`${where}: discountBps must be a non-negative integer`);
    }
    if (verifiedPriorityMinutes !== null && (!Number.isInteger(verifiedPriorityMinutes) || verifiedPriorityMinutes < 0)) {
      throw new InvalidConfigurationError(`${where}: verifiedPriorityMinutes must be a non-negative integer`);
    }
    this.id = params.id;
    this.scope = params.scope as UnverifiedDiscountScope;
    this.refId = params.refId;
    this.discountBps = discountBps;
    this.verifiedPriorityMinutes = verifiedPriorityMinutes;
    this.revision = readRevision(params.revision, where);
  }
}

export type SettingOrigin = UnverifiedDiscountScope | 'default';
export type UnverifiedLevels = readonly [UnverifiedDiscountSetting | undefined, UnverifiedDiscountSetting | undefined, UnverifiedDiscountSetting | undefined];

/** The first level of `[zone, city, country]` that sets `field`, else the default. */
function effective(levels: UnverifiedLevels, field: 'discountBps' | 'verifiedPriorityMinutes', fallback: number): { value: number; origin: SettingOrigin } {
  for (const level of levels) {
    const value = level?.[field];
    if (value !== null && value !== undefined) return { value, origin: level!.scope };
  }
  return { value: fallback, origin: 'default' };
}

/** The discount of `[zone, city, country]`; 0 when no level sets it. */
export function effectiveDiscount(levels: UnverifiedLevels): { discountBps: number; origin: SettingOrigin } {
  const { value, origin } = effective(levels, 'discountBps', 0);
  return { discountBps: value, origin };
}

/** The verified-only window of `[zone, city, country]`; 15 minutes when no level sets it. */
export function effectivePriority(levels: UnverifiedLevels): { verifiedPriorityMinutes: number; origin: SettingOrigin } {
  const { value, origin } = effective(levels, 'verifiedPriorityMinutes', VERIFIED_PRIORITY_MINUTES_DEFAULT);
  return { verifiedPriorityMinutes: value, origin };
}

/**
 * The amount taken off a match's total for a goalkeeper without the seal: rounded down (in the
 * goalkeeper's favor) and never so much that what they earn falls below the platform's commission.
 */
export function discountFor(total: number, discountBps: number, commission: number): number {
  const discount = Math.floor((total * discountBps) / 10_000);
  return Math.max(0, Math.min(discount, total - commission));
}

import type { Modality, PricedModality } from '../bookings/matchFormat.js';
import { resolveTiered, type MatchTier } from '../pricing/tieredRate.js';
import type { CommissionKind, CommissionScope, CommissionSetting } from './commissionSetting.js';
import { BPS, bpsOf } from './vat.js';

const SCOPES: readonly string[] = ['country', 'market', 'zone', 'goalkeeper'];

export interface CommissionOrigin {
  scope: CommissionScope;
  refId: string;
}

export interface CommissionBreakdownProps {
  /** One goalkeeper's booking price (rate + surcharge), before any unverified discount. */
  base: number;
  percentBps: number;
  percentAmount: number;
  fixedAmount: number;
  /** `percentAmount + fixedAmount`: the commission the goalkeeper pays, before VAT. */
  net: number;
  ruleId: string;
  origin: CommissionOrigin;
  /** The rule's tier (`null` = the general one). */
  modality: PricedModality | null;
  /** The match's modality the rule was resolved for (`any` included), so another level can be tried on the same match. */
  matchModality?: Modality;
}

/**
 * What a rule produced for one booking (feature 033): the amounts that recompose the net, and
 * which rule at which level did it. Never recomputed once stored, so the constructor insists it
 * adds up — a corrupt breakdown throws rather than charging a net nobody can explain.
 */
export class CommissionBreakdown implements CommissionBreakdownProps {
  readonly base: number;
  readonly percentBps: number;
  readonly percentAmount: number;
  readonly fixedAmount: number;
  readonly net: number;
  readonly ruleId: string;
  readonly origin: CommissionOrigin;
  readonly modality: PricedModality | null;
  readonly matchModality: Modality;

  constructor(props: CommissionBreakdownProps) {
    for (const key of ['base', 'percentBps', 'percentAmount', 'fixedAmount', 'net'] as const) {
      if (!Number.isInteger(props[key]) || props[key] < 0) throw new Error(`CommissionBreakdown: ${key} must be a non-negative integer`);
    }
    if (props.base === 0) throw new Error('CommissionBreakdown: base must be greater than 0');
    if (props.percentBps > BPS) throw new Error('CommissionBreakdown: percentBps must be at most 10000');
    if (props.percentAmount !== bpsOf(props.base, props.percentBps)) {
      throw new Error('CommissionBreakdown: percentAmount must equal the rounded percentage of the base');
    }
    if (props.net !== props.percentAmount + props.fixedAmount) throw new Error('CommissionBreakdown: net must equal percentAmount + fixedAmount');
    if (props.net === 0) throw new Error('CommissionBreakdown: net must be greater than 0');
    if (typeof props.ruleId !== 'string' || props.ruleId === '') throw new Error('CommissionBreakdown: ruleId is required');
    if (!SCOPES.includes(props.origin?.scope) || typeof props.origin.refId !== 'string' || props.origin.refId === '') {
      throw new Error('CommissionBreakdown: origin must name a known scope and a refId');
    }
    this.base = props.base;
    this.percentBps = props.percentBps;
    this.percentAmount = props.percentAmount;
    this.fixedAmount = props.fixedAmount;
    this.net = props.net;
    this.ruleId = props.ruleId;
    this.origin = { scope: props.origin.scope, refId: props.origin.refId };
    this.modality = props.modality ?? null;
    this.matchModality = props.matchModality ?? 'any';
  }
}

/**
 * Applies a rule to one goalkeeper's booking price: the percentage of the base (rounded like the
 * VAT) plus the fixed amount (clarification 4). `null` when the result is nothing to charge —
 * treated by callers exactly like "no commission configured".
 */
export function commissionFor(rule: CommissionSetting, base: number, match: MatchTier = { modality: 'any' }): CommissionBreakdown | null {
  if (!Number.isInteger(base) || base <= 0) throw new Error('commissionFor: base must be a positive integer');
  const percentAmount = bpsOf(base, rule.percentBps);
  const net = percentAmount + rule.fixedAmount;
  if (net === 0) return null;
  return new CommissionBreakdown({
    base,
    percentBps: rule.percentBps,
    percentAmount,
    fixedAmount: rule.fixedAmount,
    net,
    ruleId: rule.id,
    origin: { scope: rule.scope, refId: rule.refId },
    modality: rule.modality,
    matchModality: match.modality,
  });
}

/**
 * The goalkeeper's own commission for a booking (feature 033, FR-015): their active rule for the
 * match's modality, applied to the booking's base. `null` when they have no rule for it, or the
 * booking predates the breakdowns — then the booking's own commission applies.
 */
export function ownCommissionFor(
  ownRules: readonly CommissionSetting[],
  booking: { commission: number; commissionBreakdown: CommissionBreakdown | null },
): CommissionBreakdown | null {
  if (ownRules.length === 0 || !booking.commissionBreakdown) return null;
  const match: MatchTier = { modality: booking.commissionBreakdown.matchModality };
  const rule = resolveTiered([ownRules], match);
  return rule ? commissionFor(rule, booking.commissionBreakdown.base, match) : null;
}

/** The rule's kind as the admin shows it, derived from its components. */
export function kindOf(rule: Pick<CommissionSetting, 'fixedAmount' | 'percentBps'>): CommissionKind {
  if (rule.percentBps === 0) return 'fixed';
  if (rule.fixedAmount === 0) return 'percent';
  return 'mixed';
}

/** Every rule an admin's `fixedAmount`/`percentBps` pair breaks (feature 033): codes the admin web translates. */
export function ruleIssues(fixedAmount: unknown, percentBps: unknown, amountLimit: number): { path: string; code: string; message: string }[] {
  const issues: { path: string; code: string; message: string }[] = [];
  if (typeof fixedAmount !== 'number' || !Number.isInteger(fixedAmount) || fixedAmount < 0) {
    issues.push({ path: 'fixedAmount', code: 'not_a_whole_amount', message: 'fixedAmount must be a non-negative integer' });
  } else if (fixedAmount > amountLimit) {
    issues.push({ path: 'fixedAmount', code: 'above_limit', message: `fixedAmount must be at most ${amountLimit}` });
  }
  if (typeof percentBps !== 'number' || !Number.isInteger(percentBps) || percentBps < 0 || percentBps > BPS) {
    issues.push({ path: 'percentBps', code: 'out_of_range', message: 'percentBps must be an integer between 0 and 10000' });
  }
  if (issues.length === 0 && fixedAmount === 0 && percentBps === 0) {
    issues.push({ path: 'fixedAmount', code: 'at_least_one', message: 'a rule needs a fixed amount, a percentage or both' });
    issues.push({ path: 'percentBps', code: 'at_least_one', message: 'a rule needs a fixed amount, a percentage or both' });
  }
  return issues;
}

/** The penalty values of one country (feature 018, FR-009). */
export interface GoalkeeperPenaltyConfig {
  /** Less notice than this (in minutes) before the start makes a withdrawal late. */
  lateNoticeMinutes: number;
  lateSuspensionDays: number;
  /** The N-th counted incident within the window suspends the goalkeeper. */
  weeklyLimit: number;
  windowDays: number;
  limitSuspensionDays: number;
}

/** Colombia's values, used wherever a country defines none. */
export const DEFAULT_GOALKEEPER_PENALTIES: Readonly<GoalkeeperPenaltyConfig> = Object.freeze({
  lateNoticeMinutes: 120,
  lateSuspensionDays: 3,
  weeklyLimit: 3,
  windowDays: 7,
  limitSuspensionDays: 7,
});

export const PENALTY_CONFIG_FIELDS = [
  'lateNoticeMinutes',
  'lateSuspensionDays',
  'weeklyLimit',
  'windowDays',
  'limitSuspensionDays',
] as const satisfies readonly (keyof GoalkeeperPenaltyConfig)[];

export type PenaltyKind = 'late' | 'weekly_limit';

export interface PenaltyDraft {
  id: string;
  kind: PenaltyKind;
  days: number;
  startsAt: Date;
  endsAt: Date;
}

const DAY_MS = 86_400_000;

/** Exactly the threshold is not late: only strictly less notice is. */
export function isLate(noticeMinutes: number, config: GoalkeeperPenaltyConfig): boolean {
  return noticeMinutes < config.lateNoticeMinutes;
}

/** The start of the rolling window that counts incidents before `now` (exclusive). */
export function windowStart(now: Date, config: GoalkeeperPenaltyConfig): Date {
  return new Date(now.getTime() - config.windowDays * DAY_MS);
}

/**
 * The single penalty rule (FR-008): a late incident suspends for the late duration, and reaching
 * the weekly limit (counting this incident) suspends for the limit duration as well. Both start
 * now; they never add up, since the suspension end is the latest one in force. Feature 021 applies
 * it to a no-show as a late withdrawal.
 */
export function penaltiesFor(input: {
  occurredAt: Date;
  late: boolean;
  /** Counted incidents (not forgiven) in the window, before this one. */
  recentCount: number;
  config: GoalkeeperPenaltyConfig;
  newId: () => string;
}): PenaltyDraft[] {
  const { occurredAt, config } = input;
  const penalty = (kind: PenaltyKind, days: number): PenaltyDraft => ({
    id: input.newId(),
    kind,
    days,
    startsAt: occurredAt,
    endsAt: new Date(occurredAt.getTime() + days * DAY_MS),
  });
  const penalties: PenaltyDraft[] = [];
  if (input.late) penalties.push(penalty('late', config.lateSuspensionDays));
  if (input.recentCount + 1 >= config.weeklyLimit) penalties.push(penalty('weekly_limit', config.limitSuspensionDays));
  return penalties;
}

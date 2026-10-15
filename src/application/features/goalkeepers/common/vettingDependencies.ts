import type { IClock } from '../../../common/clock.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type { VettingActor, VerificationMethod } from '../../../../domain/goalkeepers/vetting.js';
import type { VettingLogAction, VettingLogEntry } from '../../../../domain/goalkeepers/vettingLogEntry.js';
import type { IBackgroundCheckRepository, IGoalkeeperProfileRepository, IVettingLogRepository } from './ports.js';

/** Tells the goalkeeper about a decision (implemented by `VettingNotifier`). */
export interface IVettingNotifier {
  validated(goalkeeperId: string, logEntryId: string): Promise<void>;
  validationRejected(goalkeeperId: string, logEntryId: string, reason: string): Promise<void>;
  verified(goalkeeperId: string, logEntryId: string): Promise<void>;
}

/** What the admin's validation and verification handlers need (admin spec 030). */
export interface VettingDependencies {
  profiles: IGoalkeeperProfileRepository;
  checks: IBackgroundCheckRepository;
  log: IVettingLogRepository;
  notifier: IVettingNotifier;
  idGenerator: IIdGenerator;
  clock: IClock;
}

export type FieldErrors = Record<string, string>;

/** Appends one history entry and returns it, so the notice can be keyed on its id. */
export async function recordDecision(
  deps: Pick<VettingDependencies, 'log' | 'idGenerator'>,
  entry: { goalkeeperId: string; at: Date; actor: VettingActor; action: VettingLogAction; method?: VerificationMethod | null; reason?: string | null; details?: Record<string, unknown> },
): Promise<VettingLogEntry> {
  const stored: VettingLogEntry = {
    id: deps.idGenerator.newId(),
    goalkeeperId: entry.goalkeeperId,
    at: entry.at,
    actor: entry.actor,
    action: entry.action,
    method: entry.method ?? null,
    reason: entry.reason ?? null,
    details: entry.details ?? {},
  };
  await deps.log.append(stored);
  return stored;
}

/** The trimmed reason, or a field error when it is not 3–300 characters. */
export function reasonOrError(raw: string | undefined): { reason: string } | { fieldErrors: FieldErrors } {
  const reason = raw?.trim() ?? '';
  if (reason.length < 3 || reason.length > 300) return { fieldErrors: { reason: 'reason must have between 3 and 300 characters' } };
  return { reason };
}

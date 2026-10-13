import { nextCheckAfter, type TopUp, type TopUpCheck, type TopUpCheckAnswer, type TopUpCheckResult, type TopUpStatus } from '../../../../domain/payments/topUp.js';
import type { ICountryLookup } from '../../goalkeeperRequests/common/ports.js';
import { applyTopUpOutcome, finalStatusOf, type ApplyTopUpOutcomeDependencies } from './applyTopUpOutcome.js';
import {
  GatewayUnavailableError,
  type ApplyOutcomeResult,
  type IPaymentGatewayRegistry,
  type IPaymentSecrets,
  type ITopUpRepository,
} from './ports.js';

export interface CheckTopUpDependencies extends ApplyTopUpOutcomeDependencies {
  topUpRepository: ITopUpRepository;
  gateways: IPaymentGatewayRegistry;
  secrets: IPaymentSecrets;
  countryLookup: ICountryLookup;
}

/** Who asks: the sweep keeps its schedule; a member's ask never moves it (admin spec 007, FR-005). */
export type CheckRequester = { by: 'sweep'; staffUserId: null } | { by: 'staff'; staffUserId: string };

/** What the sweep counts, as it did before the extraction. */
export type SweepResult = 'applied' | 'expired' | 'rescheduled';

export type CheckTopUpResult =
  /** Another ask holds the top-up; nothing was asked or recorded. */
  | { kind: 'busy' }
  | { kind: 'checked'; answer: TopUpCheckAnswer; result: TopUpCheckResult; statusAfter: TopUpStatus; job: SweepResult };

/** A gateway or its secrets missing for the top-up's country: nothing can be asked. */
export class GatewaySecretsMissingError extends Error {
  constructor(gateway: string) {
    super(`the ${gateway} gateway or its secrets are not available for the top-up's country`);
    this.name = 'GatewaySecretsMissingError';
  }
}

/**
 * Asks the gateway about one top-up and applies a final answer exactly like a confirmation (the
 * sweep's `check`, extracted for "Conciliar ahora", admin spec 007 research §1–§2). The top-up is
 * held for 30 seconds so two asks never run at once, and every ask is kept on it — failures too,
 * which are then thrown as before so the sweep counts and logs them unchanged.
 */
export async function checkTopUpWithGateway(
  deps: CheckTopUpDependencies,
  topUp: TopUp,
  now: Date,
  requester: CheckRequester,
): Promise<CheckTopUpResult> {
  if (!(await deps.topUpRepository.acquireCheckLease(topUp.id, now))) return { kind: 'busy' };
  const record = (answer: TopUpCheckAnswer, result: TopUpCheckResult, statusAfter: TopUpStatus) => {
    const entry: TopUpCheck = { at: now, lastAt: now, by: requester.by, staffUserId: requester.staffUserId, answer, result, statusAfter, repeats: 1 };
    return deps.topUpRepository.recordCheck(topUp.id, entry);
  };
  try {
    const gateway = deps.gateways.get(topUp.gateway);
    const country = await deps.countryLookup.getById(topUp.countryId);
    const secrets = country ? deps.secrets.forGateway(topUp.gateway, country.countryCode) : null;
    if (!gateway || !secrets) {
      await record('MISSING_SECRETS', 'failed', topUp.status);
      throw new GatewaySecretsMissingError(topUp.gateway);
    }

    let outcome;
    try {
      outcome = await gateway.findByReference(topUp.reference, topUp.environment, secrets);
    } catch (error) {
      await record(error instanceof GatewayUnavailableError ? 'UNAVAILABLE' : 'ERROR', 'failed', topUp.status);
      throw error;
    }
    const answer: TopUpCheckAnswer = outcome ? outcome.status : 'NOT_FOUND';

    const status = outcome ? finalStatusOf(outcome.status) : null;
    let mismatch = false;
    if (outcome && status) {
      const applied = await applyOrRecord(deps, topUp, status, outcome, now, (statusAfter) => record(answer, 'failed', statusAfter));
      if (applied.kind === 'applied') {
        await record(answer, 'applied', applied.topUp.status);
        return { kind: 'checked', answer, result: 'applied', statusAfter: applied.topUp.status, job: 'applied' };
      }
      // A mismatch stays pending (it was warned about) and follows the schedule to its expiry.
      if (applied.kind !== 'mismatch') {
        const statusAfter = applied.kind === 'unchanged' ? applied.topUp.status : topUp.status;
        await record(answer, 'unchanged', statusAfter);
        return { kind: 'checked', answer, result: 'unchanged', statusAfter, job: 'rescheduled' };
      }
      mismatch = true;
    }
    const waiting: TopUpCheckResult = mismatch ? 'mismatch' : 'still_pending';

    if (requester.by === 'staff') {
      await record(answer, waiting, topUp.status);
      return { kind: 'checked', answer, result: waiting, statusAfter: topUp.status, job: 'rescheduled' };
    }
    const next = nextCheckAfter(topUp, now);
    if (next === 'expire') {
      const expired = await applyOrRecord(deps, topUp, 'expired', null, now, (statusAfter) => record(answer, 'failed', statusAfter));
      if (expired.kind === 'applied') {
        await record(answer, 'expired', 'expired');
        return { kind: 'checked', answer, result: 'expired', statusAfter: 'expired', job: 'expired' };
      }
      await record(answer, waiting, topUp.status);
      return { kind: 'checked', answer, result: waiting, statusAfter: topUp.status, job: 'rescheduled' };
    }
    await deps.topUpRepository.scheduleNextCheck(topUp.id, next, now);
    await record(answer, waiting, topUp.status);
    return { kind: 'checked', answer, result: waiting, statusAfter: topUp.status, job: 'rescheduled' };
  } finally {
    await deps.topUpRepository.releaseCheckLease(topUp.id);
  }
}

/** Applies an outcome; a failure (an unresolvable wallet) is recorded before it is thrown on. */
async function applyOrRecord(
  deps: CheckTopUpDependencies,
  topUp: TopUp,
  status: Parameters<typeof applyTopUpOutcome>[2],
  outcome: Parameters<typeof applyTopUpOutcome>[3],
  now: Date,
  recordFailure: (statusAfter: TopUpStatus) => Promise<void>,
): Promise<ApplyOutcomeResult> {
  try {
    return await applyTopUpOutcome(deps, topUp, status, outcome, now);
  } catch (error) {
    await recordFailure(topUp.status);
    throw error;
  }
}

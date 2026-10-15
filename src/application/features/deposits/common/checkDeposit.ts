import { nextCheckAfter, type Deposit, type DepositCheck, type DepositCheckAnswer, type DepositCheckResult, type DepositStatus } from '../../../../domain/deposits/deposit.js';
import type { ICountryLookup } from '../../goalkeeperRequests/common/ports.js';
import { applyDepositOutcome, finalStatusOf, type ApplyDepositOutcomeDependencies } from './applyDepositOutcome.js';
import {
  GatewayUnavailableError,
  type ApplyOutcomeResult,
  type IPaymentGatewayRegistry,
  type IPaymentSecrets,
  type IDepositRepository,
} from '../../payments/common/ports.js';

export interface CheckDepositDependencies extends ApplyDepositOutcomeDependencies {
  depositRepository: IDepositRepository;
  gateways: IPaymentGatewayRegistry;
  secrets: IPaymentSecrets;
  countryLookup: ICountryLookup;
}

/** Who asks: the sweep keeps its schedule; a member's ask never moves it (admin spec 007, FR-005). */
export type CheckRequester = { by: 'sweep'; staffUserId: null } | { by: 'staff'; staffUserId: string };

/** What the sweep counts, as it did before the extraction. */
export type SweepResult = 'applied' | 'expired' | 'rescheduled';

export type CheckDepositResult =
  /** Another ask holds the deposit; nothing was asked or recorded. */
  | { kind: 'busy' }
  | { kind: 'checked'; answer: DepositCheckAnswer; result: DepositCheckResult; statusAfter: DepositStatus; job: SweepResult };

/** A gateway or its secrets missing for the deposit's country: nothing can be asked. */
export class GatewaySecretsMissingError extends Error {
  constructor(gateway: string) {
    super(`the ${gateway} gateway or its secrets are not available for the deposit's country`);
    this.name = 'GatewaySecretsMissingError';
  }
}

/**
 * Asks the gateway about one deposit and applies a final answer exactly like a confirmation (the
 * sweep's `check`, extracted for "Conciliar ahora", admin spec 007 research §1–§2). The deposit is
 * held for 30 seconds so two asks never run at once, and every ask is kept on it — failures too,
 * which are then thrown as before so the sweep counts and logs them unchanged.
 */
export async function checkDepositWithGateway(
  deps: CheckDepositDependencies,
  deposit: Deposit,
  now: Date,
  requester: CheckRequester,
): Promise<CheckDepositResult> {
  if (!(await deps.depositRepository.acquireCheckLease(deposit.id, now))) return { kind: 'busy' };
  const record = (answer: DepositCheckAnswer, result: DepositCheckResult, statusAfter: DepositStatus) => {
    const entry: DepositCheck = { at: now, lastAt: now, by: requester.by, staffUserId: requester.staffUserId, answer, result, statusAfter, repeats: 1 };
    return deps.depositRepository.recordCheck(deposit.id, entry);
  };
  try {
    const gateway = deps.gateways.get(deposit.gateway);
    const country = await deps.countryLookup.getById(deposit.countryId);
    const secrets = country ? deps.secrets.forGateway(deposit.gateway, country.countryCode) : null;
    if (!gateway || !secrets) {
      await record('MISSING_SECRETS', 'failed', deposit.status);
      throw new GatewaySecretsMissingError(deposit.gateway);
    }

    let outcome;
    try {
      outcome = await gateway.findByReference(deposit.reference, deposit.environment, secrets);
    } catch (error) {
      await record(error instanceof GatewayUnavailableError ? 'UNAVAILABLE' : 'ERROR', 'failed', deposit.status);
      throw error;
    }
    const answer: DepositCheckAnswer = outcome ? outcome.status : 'NOT_FOUND';

    const status = outcome ? finalStatusOf(outcome.status) : null;
    let mismatch = false;
    if (outcome && status) {
      const applied = await applyOrRecord(deps, deposit, status, outcome, now, (statusAfter) => record(answer, 'failed', statusAfter));
      if (applied.kind === 'applied') {
        await record(answer, 'applied', applied.deposit.status);
        return { kind: 'checked', answer, result: 'applied', statusAfter: applied.deposit.status, job: 'applied' };
      }
      // A mismatch stays pending (it was warned about) and follows the schedule to its expiry.
      if (applied.kind !== 'mismatch') {
        const statusAfter = applied.kind === 'unchanged' ? applied.deposit.status : deposit.status;
        await record(answer, 'unchanged', statusAfter);
        return { kind: 'checked', answer, result: 'unchanged', statusAfter, job: 'rescheduled' };
      }
      mismatch = true;
    }
    const waiting: DepositCheckResult = mismatch ? 'mismatch' : 'still_pending';

    if (requester.by === 'staff') {
      await record(answer, waiting, deposit.status);
      return { kind: 'checked', answer, result: waiting, statusAfter: deposit.status, job: 'rescheduled' };
    }
    const next = nextCheckAfter(deposit, now);
    if (next === 'expire') {
      const expired = await applyOrRecord(deps, deposit, 'expired', null, now, (statusAfter) => record(answer, 'failed', statusAfter));
      if (expired.kind === 'applied') {
        await record(answer, 'expired', 'expired');
        return { kind: 'checked', answer, result: 'expired', statusAfter: 'expired', job: 'expired' };
      }
      await record(answer, waiting, deposit.status);
      return { kind: 'checked', answer, result: waiting, statusAfter: deposit.status, job: 'rescheduled' };
    }
    await deps.depositRepository.scheduleNextCheck(deposit.id, next, now);
    await record(answer, waiting, deposit.status);
    return { kind: 'checked', answer, result: waiting, statusAfter: deposit.status, job: 'rescheduled' };
  } finally {
    await deps.depositRepository.releaseCheckLease(deposit.id);
  }
}

/** Applies an outcome; a failure (an unresolvable operating balance) is recorded before it is thrown on. */
async function applyOrRecord(
  deps: CheckDepositDependencies,
  deposit: Deposit,
  status: Parameters<typeof applyDepositOutcome>[2],
  outcome: Parameters<typeof applyDepositOutcome>[3],
  now: Date,
  recordFailure: (statusAfter: DepositStatus) => Promise<void>,
): Promise<ApplyOutcomeResult> {
  try {
    return await applyDepositOutcome(deps, deposit, status, outcome, now);
  } catch (error) {
    await recordFailure(deposit.status);
    throw error;
  }
}

import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { closureRefundMessage } from '../../../../../domain/notifications/accountClosureMessages.js';
import { notifyOnce } from '../../../bookingLifecycle/common/notifyOnce.js';
import { balanceStateOf, type AccountClosureDependencies } from '../../common/accountClosureDependencies.js';
import { buildDetail } from '../../common/closureAdminResults.js';
import { RecordClosureRefundCommand, type RecordClosureRefundResult } from './recordClosureRefundCommand.js';

const REFERENCE_MAX = 120;
const NOTE_MAX = 300;

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** What is wrong with the proof of the transfer, by field; empty when it is fine. */
function proofProblems(command: RecordClosureRefundCommand): Record<string, string> {
  const problems: Record<string, string> = {};
  if (command.amount > 0) {
    if (!command.reference?.trim()) problems.reference = 'The reference of the transfer is required.';
    if (!command.paidOn) problems.paidOn = 'The date of the transfer is required.';
  }
  if ((command.reference?.trim().length ?? 0) > REFERENCE_MAX) problems.reference = `The reference takes at most ${REFERENCE_MAX} characters.`;
  if (command.paidOn && !validDate(command.paidOn)) problems.paidOn = 'The date must be YYYY-MM-DD.';
  if ((command.note?.trim().length ?? 0) > NOTE_MAX) problems.note = `The note takes at most ${NOTE_MAX} characters.`;
  return problems;
}

export class RecordClosureRefundCommandHandler implements ICommandHandler<RecordClosureRefundCommand, RecordClosureRefundResult> {
  constructor(private readonly deps: AccountClosureDependencies) {}

  async handle(command: RecordClosureRefundCommand): Promise<RecordClosureRefundResult> {
    const { deps } = this;
    const closure = await deps.closures.findById(command.closureId);
    if (!closure) return { outcome: 'not_found' };
    if (closure.status === 'refund_recorded' && closure.refund?.amount === command.amount) {
      return { outcome: 'replayed', detail: await buildDetail(deps, closure) };
    }
    if (closure.status !== 'requested') return { outcome: 'invalid_transition' };

    const fieldErrors = proofProblems(command);
    if (Object.keys(fieldErrors).length > 0) return { outcome: 'validation_failed', fieldErrors };

    const state = await balanceStateOf(deps, closure.userId, closure.role);
    // The movement exists but the status did not save: the amount is the one it returned.
    const prior = await deps.movements.findByCauseKey(`closure_refund:${closure.id}`);
    const balance = prior ? -prior.amount : (state.balance ?? 0);
    if (!prior && balance < 0) return { outcome: 'debt_pending', balance };
    if (command.amount !== balance) return { outcome: 'refund_amount_mismatch', balance };

    const blockers = await deps.blockers.forUser(closure.userId, closure.role);
    if (blockers.length > 0) return { outcome: 'closure_blockers_pending', blockers };

    let movementId: string | null = prior?.id ?? null;
    if (!prior && balance > 0) {
      if (!state.owner) return { outcome: 'invalid_transition' };
      const result = await deps.ledger.refundClosure(state.owner, { closureId: closure.id, amount: balance, adminUserId: command.adminUserId });
      if (result.kind === 'insufficient_funds') return { outcome: 'refund_amount_mismatch', balance: result.balance };
      movementId = result.movement.id;
    }

    const transition = closure.recordRefund({
      by: command.adminUserId,
      now: deps.clock.now(),
      amount: balance,
      reference: command.reference,
      paidOn: command.paidOn,
      note: command.note,
      movementId,
    });
    if (!transition.ok) return { outcome: 'invalid_transition' };
    if (!(await deps.closures.save(transition.closure, 'requested'))) return { outcome: 'invalid_transition' };

    await notifyOnce(deps.notices, {
      userId: closure.userId,
      message: closureRefundMessage(balance, state.currency ?? closure.currency, closure.id),
      dedupeKey: `account-closure-refund:${closure.id}`,
    });
    return { outcome: 'ok', detail: await buildDetail(deps, transition.closure) };
  }
}

import type { HandlerRegistration } from '../application/common/mediator/mediator.js';
import { CancelAccountClosureCommand } from '../application/features/accountClosures/commands/cancelAccountClosure/cancelAccountClosureCommand.js';
import { CancelAccountClosureCommandHandler } from '../application/features/accountClosures/commands/cancelAccountClosure/cancelAccountClosureCommandHandler.js';
import { CloseAccountCommand } from '../application/features/accountClosures/commands/closeAccount/closeAccountCommand.js';
import { CloseAccountCommandHandler } from '../application/features/accountClosures/commands/closeAccount/closeAccountCommandHandler.js';
import { RecordClosureRefundCommand } from '../application/features/accountClosures/commands/recordClosureRefund/recordClosureRefundCommand.js';
import { RecordClosureRefundCommandHandler } from '../application/features/accountClosures/commands/recordClosureRefund/recordClosureRefundCommandHandler.js';
import { RejectAccountClosureCommand } from '../application/features/accountClosures/commands/rejectAccountClosure/rejectAccountClosureCommand.js';
import { RejectAccountClosureCommandHandler } from '../application/features/accountClosures/commands/rejectAccountClosure/rejectAccountClosureCommandHandler.js';
import { RequestAccountClosureCommand } from '../application/features/accountClosures/commands/requestAccountClosure/requestAccountClosureCommand.js';
import { RequestAccountClosureCommandHandler } from '../application/features/accountClosures/commands/requestAccountClosure/requestAccountClosureCommandHandler.js';
import { ResolveClosureDebtCommand } from '../application/features/accountClosures/commands/resolveClosureDebt/resolveClosureDebtCommand.js';
import { ResolveClosureDebtCommandHandler } from '../application/features/accountClosures/commands/resolveClosureDebt/resolveClosureDebtCommandHandler.js';
import type { AccountClosureDependencies } from '../application/features/accountClosures/common/accountClosureDependencies.js';
import { GetAccountClosureAdminQuery } from '../application/features/accountClosures/queries/getAccountClosureAdmin/getAccountClosureAdminQuery.js';
import { GetAccountClosureAdminQueryHandler } from '../application/features/accountClosures/queries/getAccountClosureAdmin/getAccountClosureAdminQueryHandler.js';
import { GetClosureGateQuery } from '../application/features/accountClosures/queries/getClosureGate/getClosureGateQuery.js';
import { GetClosureGateQueryHandler } from '../application/features/accountClosures/queries/getClosureGate/getClosureGateQueryHandler.js';
import { GetMyAccountClosureQuery } from '../application/features/accountClosures/queries/getMyAccountClosure/getMyAccountClosureQuery.js';
import { GetMyAccountClosureQueryHandler } from '../application/features/accountClosures/queries/getMyAccountClosure/getMyAccountClosureQueryHandler.js';
import { ListAccountClosuresAdminQuery } from '../application/features/accountClosures/queries/listAccountClosuresAdmin/listAccountClosuresAdminQuery.js';
import { ListAccountClosuresAdminQueryHandler } from '../application/features/accountClosures/queries/listAccountClosuresAdmin/listAccountClosuresAdminQueryHandler.js';

/**
 * The account closure handlers (feature 029): the user's own request and the administrators' queue.
 * Shared by the composition root and the HTTP tests' fake-backed one, so both register the same set.
 */
export function accountClosureHandlerRegistrations(deps: AccountClosureDependencies): HandlerRegistration[] {
  return [
    { requestType: GetClosureGateQuery, handler: new GetClosureGateQueryHandler(deps.closures) },
    { requestType: GetMyAccountClosureQuery, handler: new GetMyAccountClosureQueryHandler(deps) },
    { requestType: RequestAccountClosureCommand, handler: new RequestAccountClosureCommandHandler(deps) },
    { requestType: CancelAccountClosureCommand, handler: new CancelAccountClosureCommandHandler(deps) },
    { requestType: ListAccountClosuresAdminQuery, handler: new ListAccountClosuresAdminQueryHandler(deps) },
    { requestType: GetAccountClosureAdminQuery, handler: new GetAccountClosureAdminQueryHandler(deps) },
    { requestType: ResolveClosureDebtCommand, handler: new ResolveClosureDebtCommandHandler(deps) },
    { requestType: RecordClosureRefundCommand, handler: new RecordClosureRefundCommandHandler(deps) },
    { requestType: CloseAccountCommand, handler: new CloseAccountCommandHandler(deps) },
    { requestType: RejectAccountClosureCommand, handler: new RejectAccountClosureCommandHandler(deps) },
  ];
}

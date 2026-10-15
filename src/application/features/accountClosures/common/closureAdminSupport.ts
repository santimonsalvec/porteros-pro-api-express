import type { AccountClosure } from '../../../../domain/accountClosures/accountClosure.js';
import { userName } from '../../users/common/userViewing.js';
import type { ClosureUserRef } from './adminClosureViews.js';
import { balanceStateOf, type AccountClosureDependencies } from './accountClosureDependencies.js';

/** The people behind these closures: name and email as recorded; unknown users keep their id. */
export async function closureUsers(
  deps: Pick<AccountClosureDependencies, 'users'>,
  closures: readonly AccountClosure[],
): Promise<(closure: AccountClosure) => ClosureUserRef> {
  const ids = [...new Set(closures.map((closure) => closure.userId))];
  const users = ids.length > 0 ? await deps.users.getByIds(ids) : [];
  const byId = new Map(users.map((user) => [user.id, user]));
  return (closure) => {
    const user = byId.get(closure.userId);
    return { userId: closure.userId, name: user ? userName(user) : null, email: user?.email ?? null, role: closure.role };
  };
}

/** The balance now and what stands in the way, for the actions an administrator may take. */
export async function currentSituation(deps: AccountClosureDependencies, closure: AccountClosure) {
  const [state, blockers] = await Promise.all([
    balanceStateOf(deps, closure.userId, closure.role),
    deps.blockers.forUser(closure.userId, closure.role),
  ]);
  return { state, blockers, allowedActions: closure.allowedActions({ balance: state.balance, blockers: blockers.length }) };
}

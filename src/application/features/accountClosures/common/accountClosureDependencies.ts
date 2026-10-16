import type { IClock } from '../../../common/clock.js';
import type { IIdGenerator, IUserRepository } from '../../auth/common/ports.js';
import type { NotifyOnceDependencies } from '../../bookingLifecycle/common/notifyOnce.js';
import type { IDeviceRepository } from '../../devices/common/ports.js';
import type { IUserAdminReader } from '../../users/common/ports.js';
import type { IGoalkeeperProfileRepository } from '../../goalkeepers/common/ports.js';
import {
  resolveGoalkeeperOperatingBalanceContext,
  type GoalkeeperOperatingBalanceContextDependencies,
} from '../../operatingBalance/common/goalkeeperOperatingBalanceContext.js';
import type { OperatingBalanceLedger, LedgerOwner } from '../../operatingBalance/common/operatingBalanceLedger.js';
import type { IBalanceMovementRepository, IOperatingBalanceRepository } from '../../operatingBalance/common/ports.js';
import type { IAccountClosureRepository, IClosureBlockersReader } from './ports.js';

/** What every account-closure use case reads and writes (feature 029). */
export interface AccountClosureDependencies {
  closures: IAccountClosureRepository;
  /** The administrators' name/email search, to filter the list by user. */
  userSearch: Pick<IUserAdminReader, 'findIds'>;
  users: Pick<IUserRepository, 'getById' | 'getByIds'>;
  profiles: Pick<IGoalkeeperProfileRepository, 'getByUserId' | 'setAvailableForOffers'>;
  balanceContext: GoalkeeperOperatingBalanceContextDependencies;
  balances: Pick<IOperatingBalanceRepository, 'findByGoalkeeperId'>;
  movements: Pick<IBalanceMovementRepository, 'findByCauseKey'>;
  ledger: Pick<OperatingBalanceLedger, 'refundClosure' | 'waiveDebt'>;
  blockers: IClosureBlockersReader;
  notices: NotifyOnceDependencies;
  devices: Pick<IDeviceRepository, 'findByUserIds' | 'removeByTokens'>;
  /** The smallest deposit option that covers `debt`, or the largest option; `null` with none usable. */
  suggestDepositAmount: (goalkeeperId: string, debt: number) => Promise<number | null>;
  idGenerator: IIdGenerator;
  clock: IClock;
}

export type ClosureRoleOf = 'goalkeeper' | 'client';

/** A user with an active goalkeeper profile closes as a goalkeeper, anyone else as a client. */
export async function roleOf(deps: Pick<AccountClosureDependencies, 'profiles'>, userId: string): Promise<ClosureRoleOf> {
  return (await deps.profiles.getByUserId(userId)) ? 'goalkeeper' : 'client';
}

export interface BalanceState {
  /** `null` for a client, who has none. */
  balance: number | null;
  currency: string | null;
  /** Who and in which currency the ledger writes for; `null` when it can't (not a goalkeeper, not configured). */
  owner: LedgerOwner | null;
}

/** The balance right now, and who the ledger would write for. */
export async function balanceStateOf(deps: AccountClosureDependencies, userId: string, role: ClosureRoleOf): Promise<BalanceState> {
  if (role === 'client') return { balance: null, currency: null, owner: null };
  const [context, stored] = await Promise.all([
    resolveGoalkeeperOperatingBalanceContext(deps.balanceContext, userId),
    deps.balances.findByGoalkeeperId(userId),
  ]);
  const owner: LedgerOwner | null =
    context.kind === 'ok' ? { goalkeeperId: userId, currency: stored?.currency ?? context.currency, invoicing: context.invoicing, marketId: context.profile.marketId } : null;
  return {
    balance: stored?.balance ?? 0,
    currency: stored?.currency ?? (context.kind === 'ok' ? context.currency : null),
    owner,
  };
}

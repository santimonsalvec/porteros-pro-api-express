import { canReconcile, expiresAtOf, type Deposit, type DepositCheck, type DepositCheckAnswer, type DepositCheckResult, type DepositStatus } from '../../../../domain/deposits/deposit.js';
import type { IUserRepository } from '../../auth/common/ports.js';
import type { ICountryLookup } from '../../goalkeeperRequests/common/ports.js';
import { personNames } from '../../goalkeeperRequests/common/adminNames.js';
import type { PersonRef } from '../../goalkeeperRequests/common/adminViews.js';
import type { IDepositAdminReader } from '../../payments/common/adminPorts.js';

export interface DepositAdminDependencies {
  reader: IDepositAdminReader;
  users: Pick<IUserRepository, 'getByIds'>;
  countries: ICountryLookup;
}

/** A row of the admin's deposit list (admin spec 007, contracts/finance-api.md §2). */
export interface DepositRow {
  depositId: string;
  createdAt: string;
  goalkeeper: PersonRef;
  countryId: string;
  countryName: string | null;
  amount: number;
  cost: number;
  net: number;
  currency: string;
  gateway: string;
  environment: string;
  status: DepositStatus;
}

export interface DepositCheckView {
  at: string;
  lastAt: string;
  by: DepositCheck['by'];
  /** The member who asked; `null` for the sweep. */
  staff: PersonRef | null;
  answer: DepositCheckAnswer;
  result: DepositCheckResult;
  statusAfter: DepositStatus;
  repeats: number;
}

/** A deposit's detail (§4): the row, its references, its checks and what comes next. */
export interface DepositDetail extends DepositRow {
  reference: string;
  gatewayTransactionId: string | null;
  finalizedAt: string | null;
  lastCheckedAt: string | null;
  checks: number;
  /** While pending: the sweep's next ask and when it expires. */
  nextCheckAt: string | null;
  expiresAt: string | null;
  canReconcile: boolean;
  checkLog: DepositCheckView[];
}

/** People and countries of a set of deposits, read once each. */
export async function depositNames(deps: DepositAdminDependencies, deposits: readonly Deposit[], staffIds: readonly string[] = []) {
  const countryIds = [...new Set(deposits.map((deposit) => deposit.countryId))];
  const [people, countries] = await Promise.all([
    personNames(deps, [...deposits.map((deposit) => deposit.goalkeeperId), ...staffIds]),
    Promise.all(countryIds.map((id) => deps.countries.getById(id))),
  ]);
  const countryNames = new Map(countries.filter((country) => country !== null).map((country) => [country.id, country.name]));
  return { people, country: (id: string) => countryNames.get(id) ?? null };
}

export function toDepositRow(deposit: Deposit, names: Awaited<ReturnType<typeof depositNames>>): DepositRow {
  return {
    depositId: deposit.id,
    createdAt: deposit.createdAt.toISOString(),
    goalkeeper: names.people(deposit.goalkeeperId),
    countryId: deposit.countryId,
    countryName: names.country(deposit.countryId),
    amount: deposit.amount,
    cost: deposit.cost,
    net: deposit.net,
    currency: deposit.currency,
    gateway: deposit.gateway,
    environment: deposit.environment,
    status: deposit.status,
  };
}

export function toDepositDetail(deposit: Deposit, checkLog: readonly DepositCheck[], names: Awaited<ReturnType<typeof depositNames>>): DepositDetail {
  const pending = deposit.status === 'pending';
  return {
    ...toDepositRow(deposit, names),
    reference: deposit.reference,
    gatewayTransactionId: deposit.gatewayTransactionId,
    finalizedAt: deposit.finalizedAt?.toISOString() ?? null,
    lastCheckedAt: deposit.lastCheckedAt?.toISOString() ?? null,
    checks: deposit.checks,
    nextCheckAt: pending ? (deposit.nextCheckAt?.toISOString() ?? null) : null,
    expiresAt: pending ? expiresAtOf(deposit.createdAt).toISOString() : null,
    canReconcile: canReconcile(deposit.status),
    checkLog: checkLog.map((check) => ({
      at: new Date(check.at).toISOString(),
      lastAt: new Date(check.lastAt).toISOString(),
      by: check.by,
      staff: check.staffUserId ? names.people(check.staffUserId) : null,
      answer: check.answer,
      result: check.result,
      statusAfter: check.statusAfter,
      repeats: check.repeats,
    })),
  };
}

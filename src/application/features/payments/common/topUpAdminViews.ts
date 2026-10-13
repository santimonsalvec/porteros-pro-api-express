import { canReconcile, expiresAtOf, type TopUp, type TopUpCheck, type TopUpCheckAnswer, type TopUpCheckResult, type TopUpStatus } from '../../../../domain/payments/topUp.js';
import type { IUserRepository } from '../../auth/common/ports.js';
import type { ICountryLookup } from '../../goalkeeperRequests/common/ports.js';
import { personNames } from '../../goalkeeperRequests/common/adminNames.js';
import type { PersonRef } from '../../goalkeeperRequests/common/adminViews.js';
import type { ITopUpAdminReader } from './adminPorts.js';

export interface TopUpAdminDependencies {
  reader: ITopUpAdminReader;
  users: Pick<IUserRepository, 'getByIds'>;
  countries: ICountryLookup;
}

/** A row of the admin's top-up list (admin spec 007, contracts/finance-api.md §2). */
export interface TopUpRow {
  topUpId: string;
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
  status: TopUpStatus;
}

export interface TopUpCheckView {
  at: string;
  lastAt: string;
  by: TopUpCheck['by'];
  /** The member who asked; `null` for the sweep. */
  staff: PersonRef | null;
  answer: TopUpCheckAnswer;
  result: TopUpCheckResult;
  statusAfter: TopUpStatus;
  repeats: number;
}

/** A top-up's detail (§4): the row, its references, its checks and what comes next. */
export interface TopUpDetail extends TopUpRow {
  reference: string;
  gatewayTransactionId: string | null;
  finalizedAt: string | null;
  lastCheckedAt: string | null;
  checks: number;
  /** While pending: the sweep's next ask and when it expires. */
  nextCheckAt: string | null;
  expiresAt: string | null;
  canReconcile: boolean;
  checkLog: TopUpCheckView[];
}

/** People and countries of a set of top-ups, read once each. */
export async function topUpNames(deps: TopUpAdminDependencies, topUps: readonly TopUp[], staffIds: readonly string[] = []) {
  const countryIds = [...new Set(topUps.map((topUp) => topUp.countryId))];
  const [people, countries] = await Promise.all([
    personNames(deps, [...topUps.map((topUp) => topUp.goalkeeperId), ...staffIds]),
    Promise.all(countryIds.map((id) => deps.countries.getById(id))),
  ]);
  const countryNames = new Map(countries.filter((country) => country !== null).map((country) => [country.id, country.name]));
  return { people, country: (id: string) => countryNames.get(id) ?? null };
}

export function toTopUpRow(topUp: TopUp, names: Awaited<ReturnType<typeof topUpNames>>): TopUpRow {
  return {
    topUpId: topUp.id,
    createdAt: topUp.createdAt.toISOString(),
    goalkeeper: names.people(topUp.goalkeeperId),
    countryId: topUp.countryId,
    countryName: names.country(topUp.countryId),
    amount: topUp.amount,
    cost: topUp.cost,
    net: topUp.net,
    currency: topUp.currency,
    gateway: topUp.gateway,
    environment: topUp.environment,
    status: topUp.status,
  };
}

export function toTopUpDetail(topUp: TopUp, checkLog: readonly TopUpCheck[], names: Awaited<ReturnType<typeof topUpNames>>): TopUpDetail {
  const pending = topUp.status === 'pending';
  return {
    ...toTopUpRow(topUp, names),
    reference: topUp.reference,
    gatewayTransactionId: topUp.gatewayTransactionId,
    finalizedAt: topUp.finalizedAt?.toISOString() ?? null,
    lastCheckedAt: topUp.lastCheckedAt?.toISOString() ?? null,
    checks: topUp.checks,
    nextCheckAt: pending ? (topUp.nextCheckAt?.toISOString() ?? null) : null,
    expiresAt: pending ? expiresAtOf(topUp.createdAt).toISOString() : null,
    canReconcile: canReconcile(topUp.status),
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

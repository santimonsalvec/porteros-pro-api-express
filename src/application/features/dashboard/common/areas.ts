import type { Permission } from '../../../../domain/staff/permissionCatalog.js';
import type { CasesArea, GoalkeepersArea, InvoicingArea, RegistrationsArea, RequestsArea, StatusCounts, DepositsArea, OperatingBalancesArea } from './ports.js';

export interface DashboardAreas {
  requests: RequestsArea;
  goalkeepers: GoalkeepersArea;
  registrations: RegistrationsArea;
  cases: CasesArea;
  invoicing: InvoicingArea;
  deposits: DepositsArea;
  operatingBalances: OperatingBalancesArea;
}

export type DashboardArea = keyof DashboardAreas;

/** The permission each area needs besides `dashboard.read` (research §1): the one of its list. */
export const AREA_PERMISSIONS: { readonly [A in DashboardArea]: Permission } = {
  requests: 'requests.read',
  goalkeepers: 'goalkeepers.read',
  registrations: 'goalkeepers.registrations.review',
  cases: 'cases.read',
  invoicing: 'invoicing.read',
  deposits: 'deposits.read',
  operatingBalances: 'operating_balances.read',
};

export const DASHBOARD_AREAS = Object.keys(AREA_PERMISSIONS) as DashboardArea[];

/** Every status in zero, so the screen always shows the same ones (US1 scenario 4). */
export function emptyStatusCounts<S extends string>(statuses: readonly S[]): StatusCounts<S> {
  return { total: 0, byStatus: Object.fromEntries(statuses.map((status) => [status, 0])) as Record<S, number> };
}

/** Counts by status from `{ status, count }` rows, unknown statuses ignored. */
export function statusCountsFrom<S extends string>(statuses: readonly S[], rows: readonly { status: string; count: number }[]): StatusCounts<S> {
  const counts = emptyStatusCounts(statuses);
  for (const row of rows) {
    if (!(statuses as readonly string[]).includes(row.status)) continue;
    counts.byStatus[row.status as S] += row.count;
    counts.total += row.count;
  }
  return counts;
}

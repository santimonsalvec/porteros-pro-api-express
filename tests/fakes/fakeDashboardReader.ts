import { emptyStatusCounts } from '../../src/application/features/dashboard/common/areas.js';
import type { DashboardAreas } from '../../src/application/features/dashboard/common/areas.js';
import type { DashboardReadContext, IDashboardReader } from '../../src/application/features/dashboard/common/ports.js';
import { BOOKING_STATUSES } from '../../src/domain/bookings/booking.js';

const REQUEST_STATUSES = ['searching', 'partially_assigned', 'assigned', 'completed', 'cancelled', 'expired', 'closed'] as const;

/** Zeros everywhere, the shape of the contract (data-model). */
export function zeroAreas(days: readonly string[] = []): DashboardAreas {
  return {
    requests: {
      requests: { today: emptyStatusCounts(REQUEST_STATUSES), week: emptyStatusCounts(REQUEST_STATUSES) },
      bookings: {
        today: emptyStatusCounts(BOOKING_STATUSES),
        week: emptyStatusCounts(BOOKING_STATUSES),
        weekByDay: days.map((date) => ({ date, counts: emptyStatusCounts(BOOKING_STATUSES) })),
      },
    },
    goalkeepers: { active: 0, available: 0, suspended: 0, blocked: 0 },
    registrations: { inProgress: 0 },
    cases: { open: 0 },
    invoicing: { rejected: 0, stale: 0 },
    deposits: { pending: 0 },
    operatingBalances: { byCurrency: [] },
  };
}

/**
 * The dashboard's reads for the HTTP tests: what `areas` holds (zeros by default, with the week's
 * days), what each area was asked with, and the areas told to throw. The Mongo pipelines have
 * their own unit tests.
 */
export class FakeDashboardReader implements IDashboardReader {
  areas: Partial<DashboardAreas> = {};
  readonly failing = new Set<keyof DashboardAreas>();
  readonly contexts: DashboardReadContext[] = [];
  goalkeeperIds: string[] = [];

  async goalkeeperIdsInCities(): Promise<string[]> {
    return this.goalkeeperIds;
  }

  private answer<A extends keyof DashboardAreas>(area: A, context: DashboardReadContext): Promise<DashboardAreas[A]> {
    this.contexts.push(context);
    if (this.failing.has(area)) return Promise.reject(new Error(`fake failure in ${area}`));
    return Promise.resolve((this.areas[area] ?? zeroAreas(context.windows.days)[area]) as DashboardAreas[A]);
  }

  requests = (context: DashboardReadContext) => this.answer('requests', context);
  goalkeepers = (context: DashboardReadContext) => this.answer('goalkeepers', context);
  registrations = (context: DashboardReadContext) => this.answer('registrations', context);
  cases = (context: DashboardReadContext) => this.answer('cases', context);
  invoicing = (context: DashboardReadContext) => this.answer('invoicing', context);
  deposits = (context: DashboardReadContext) => this.answer('deposits', context);
  operatingBalances = (context: DashboardReadContext) => this.answer('operatingBalances', context);
}

import type { BookingStatus } from '../../../../domain/bookings/booking.js';
import type { RequestStatus } from '../../../../domain/bookings/requestStatus.js';
import type { DashboardScope } from './scope.js';
import type { DashboardWindows } from './windows.js';

/** A market as the dashboard's scope needs it: its country and its clock (spec 031). */
export interface DashboardGeographyMarket {
  id: string;
  countryId: string;
  timeZone: string;
}

/** The geography the dashboard's scope reads (admin spec 008, research §2). */
export interface IDashboardGeography {
  countryExists(countryId: string): Promise<boolean>;
  getMarket(marketId: string): Promise<DashboardGeographyMarket | null>;
  marketsOfCountry(countryId: string): Promise<DashboardGeographyMarket[]>;
}


/** A total and every status's count, the empty ones included (data-model). */
export interface StatusCounts<S extends string> {
  total: number;
  byStatus: Record<S, number>;
}

export interface RequestsArea {
  requests: { today: StatusCounts<RequestStatus>; week: StatusCounts<RequestStatus> };
  bookings: {
    today: StatusCounts<BookingStatus>;
    week: StatusCounts<BookingStatus>;
    /** The week's seven local dates, Monday first. */
    weekByDay: { date: string; counts: StatusCounts<BookingStatus> }[];
  };
}

export interface GoalkeepersArea {
  active: number;
  /** Offers on, not suspended and not blocked (Clarifications). */
  available: number;
  suspended: number;
  blocked: number;
}

export interface RegistrationsArea {
  inProgress: number;
}

export interface CasesArea {
  open: number;
}

export interface InvoicingArea {
  rejected: number;
  /** Pending or awaiting the authority for more than 24 h, as the document list says. */
  stale: number;
}

export interface DepositsArea {
  pending: number;
}

export interface OperatingBalancesArea {
  /** One row per currency: amounts of different currencies are never added (FR-006). */
  byCurrency: { currency: string; balanceTotal: number; debtTotal: number; negativeCount: number }[];
}

/** What every area is read with. */
export interface DashboardReadContext {
  scope: DashboardScope;
  windows: DashboardWindows;
  now: Date;
  /** The scope's goalkeepers, looked up once per summary; `null` for the whole platform. */
  goalkeeperIds: () => Promise<string[] | null>;
}

/** One read per dashboard area (admin spec 008, research §1–§5). */
export interface IDashboardReader {
  goalkeeperIdsInMarkets(marketIds: readonly string[]): Promise<string[]>;
  requests(context: DashboardReadContext): Promise<RequestsArea>;
  goalkeepers(context: DashboardReadContext): Promise<GoalkeepersArea>;
  registrations(context: DashboardReadContext): Promise<RegistrationsArea>;
  cases(context: DashboardReadContext): Promise<CasesArea>;
  invoicing(context: DashboardReadContext): Promise<InvoicingArea>;
  deposits(context: DashboardReadContext): Promise<DepositsArea>;
  operatingBalances(context: DashboardReadContext): Promise<OperatingBalancesArea>;
}

/** The dashboard's logging, so the application never imports pino. Never given personal data. */
export interface IDashboardLogger {
  warn(entry: Record<string, unknown>, message: string): void;
}
/** How long before the start the check-in opens and after it it closes (feature 020, per country). */
export interface CheckInWindowConfig {
  opensMinutesBefore: number;
  closesMinutesAfter: number;
}

/** Colombia's values, used wherever a country defines none. */
export const CHECK_IN_DEFAULTS: Readonly<CheckInWindowConfig> = Object.freeze({ opensMinutesBefore: 30, closesMinutesAfter: 15 });

/** The "10 minutes left" reminder goes this long before the window closes (clarification 2). */
export const LAST_CALL_MINUTES_BEFORE_CLOSE = 10;

export interface CheckInWindow {
  opensAt: Date;
  /** When the goalkeeper is reminded they're running out of time; never before `opensAt`. */
  lastCallAt: Date;
  closesAt: Date;
}

const MINUTE = 60_000;

export function checkInWindow(startsAt: Date, config: CheckInWindowConfig): CheckInWindow {
  const opensAt = new Date(startsAt.getTime() - config.opensMinutesBefore * MINUTE);
  const closesAt = new Date(startsAt.getTime() + config.closesMinutesAfter * MINUTE);
  const lastCallAt = new Date(Math.max(opensAt.getTime(), closesAt.getTime() - LAST_CALL_MINUTES_BEFORE_CLOSE * MINUTE));
  return { opensAt, lastCallAt, closesAt };
}

/** Inclusive at both ends, on the platform's clock. After the close there is no check-in (clarification 1). */
export function isCheckInOpen(window: CheckInWindow, now: Date): boolean {
  return now.getTime() >= window.opensAt.getTime() && now.getTime() <= window.closesAt.getTime();
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

/** Great-circle (haversine) distance in whole meters. Informational only: never blocks a check-in. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h))));
}

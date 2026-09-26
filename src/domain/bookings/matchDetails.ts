/** What was quoted and booked: where, when and how many goalkeepers for how long. */
export class MatchDetails {
  readonly latitude: number;
  readonly longitude: number;
  /** The active zone the point fell in when the quote was issued. */
  readonly zoneId: string;
  /** The zone's owning (anchor) city. */
  readonly cityId: string;
  /** The start instant (UTC). */
  readonly startsAt: Date;
  /** The same instant in the city's zone, `…±HH:mm` — display only. */
  readonly startsAtLocal: string;
  /** The city's IANA time-zone identifier. */
  readonly timeZone: string;
  readonly goalkeeperCount: 1 | 2;
  readonly durationMinutes: 60 | 90 | 120;

  constructor(params: {
    latitude: number;
    longitude: number;
    zoneId: string;
    cityId: string;
    startsAt: Date;
    startsAtLocal: string;
    timeZone: string;
    goalkeeperCount: number;
    durationMinutes: number;
  }) {
    if (!Number.isFinite(params.latitude) || params.latitude < -90 || params.latitude > 90) {
      throw new Error('MatchDetails: latitude must be between -90 and 90');
    }
    if (!Number.isFinite(params.longitude) || params.longitude < -180 || params.longitude > 180) {
      throw new Error('MatchDetails: longitude must be between -180 and 180');
    }
    if (!(params.startsAt instanceof Date) || Number.isNaN(params.startsAt.getTime())) {
      throw new Error('MatchDetails: startsAt must be a valid date');
    }
    for (const key of ['zoneId', 'cityId', 'timeZone', 'startsAtLocal'] as const) {
      if (typeof params[key] !== 'string' || params[key] === '') {
        throw new Error(`MatchDetails: ${key} is required`);
      }
    }
    if (params.goalkeeperCount !== 1 && params.goalkeeperCount !== 2) {
      throw new Error('MatchDetails: goalkeeperCount must be 1 or 2');
    }
    if (
      params.durationMinutes !== 60 &&
      params.durationMinutes !== 90 &&
      params.durationMinutes !== 120
    ) {
      throw new Error('MatchDetails: durationMinutes must be 60, 90 or 120');
    }
    this.latitude = params.latitude;
    this.longitude = params.longitude;
    this.zoneId = params.zoneId;
    this.cityId = params.cityId;
    this.startsAt = new Date(params.startsAt);
    this.startsAtLocal = params.startsAtLocal;
    this.timeZone = params.timeZone;
    this.goalkeeperCount = params.goalkeeperCount;
    this.durationMinutes = params.durationMinutes;
  }
}

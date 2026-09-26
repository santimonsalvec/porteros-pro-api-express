import { describe, expect, it } from 'vitest';
import { MatchDetails } from '../../../../src/domain/bookings/matchDetails.js';

const valid = {
  latitude: 3.45,
  longitude: -76.5,
  zoneId: 'zone-cali-norte',
  cityId: 'city-cali',
  startsAt: new Date('2026-09-21T20:00:00.000Z'),
  startsAtLocal: '2026-09-21T15:00:00-05:00',
  timeZone: 'America/Bogota',
  goalkeeperCount: 2,
  durationMinutes: 90,
};

describe('MatchDetails', () => {
  it('accepts valid details and copies the start instant', () => {
    const match = new MatchDetails(valid);

    expect(match).toMatchObject({ ...valid, startsAt: valid.startsAt });
    expect(match.startsAt).not.toBe(valid.startsAt);
  });

  it.each([
    ['latitude above 90', { latitude: 90.1 }],
    ['latitude below -90', { latitude: -91 }],
    ['longitude above 180', { longitude: 180.5 }],
    ['an invalid start date', { startsAt: new Date('nope') }],
    ['an empty zone id', { zoneId: '' }],
    ['an empty time zone', { timeZone: '' }],
    ['3 goalkeepers', { goalkeeperCount: 3 }],
    ['a 45-minute duration', { durationMinutes: 45 }],
  ])('rejects %s', (_label, override) => {
    expect(() => new MatchDetails({ ...valid, ...override })).toThrow();
  });
});

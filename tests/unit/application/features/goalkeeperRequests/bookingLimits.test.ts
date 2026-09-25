import { describe, expect, it } from 'vitest';
import {
  DURATION_OPTIONS,
  GOALKEEPER_COUNT_MAX,
  GOALKEEPER_COUNT_MIN,
  GOALKEEPER_COUNTS,
  SLOT_STEP_MINUTES,
  isDurationOption,
  isGoalkeeperCount,
} from '../../../../../src/application/features/goalkeeperRequests/common/bookingLimits.js';
import { RentalRate } from '../../../../../src/domain/pricing/rentalRate.js';
import { getServiceQuoteRequestSchema } from '../../../../../src/controllers/requests/goalkeeperRequests/getServiceQuoteRequest.js';

const base = { latitude: 6.2, longitude: -75.5, startsAt: '2026-09-21T15:00:00' };
const accepts = (fields: object) => getServiceQuoteRequestSchema.safeParse({ ...base, goalkeeperCount: 1, durationMinutes: 60, ...fields }).success;

describe('booking limits — one source of truth', () => {
  it('the min and max goalkeeper counts are the ends of the allowed counts', () => {
    expect(GOALKEEPER_COUNT_MIN).toBe(Math.min(...GOALKEEPER_COUNTS));
    expect(GOALKEEPER_COUNT_MAX).toBe(Math.max(...GOALKEEPER_COUNTS));
  });

  it('the quote request accepts exactly the goalkeeper counts the config offers, and nothing near them', () => {
    for (const count of GOALKEEPER_COUNTS) expect(accepts({ goalkeeperCount: count })).toBe(true);
    for (const bad of [0, GOALKEEPER_COUNT_MIN - 1, GOALKEEPER_COUNT_MAX + 1, 1.5, '1', null]) expect(accepts({ goalkeeperCount: bad })).toBe(false);
  });

  it('the quote request accepts exactly the durations the config offers, and nothing near them', () => {
    for (const duration of DURATION_OPTIONS) expect(accepts({ durationMinutes: duration })).toBe(true);
    for (const bad of [0, 30, 45, 61, 150, 180, '60', null]) expect(accepts({ durationMinutes: bad })).toBe(false);
  });

  it('the type guards agree with the constants', () => {
    for (const duration of DURATION_OPTIONS) expect(isDurationOption(duration)).toBe(true);
    for (const count of GOALKEEPER_COUNTS) expect(isGoalkeeperCount(count)).toBe(true);
    expect(isDurationOption(45)).toBe(false);
    expect(isGoalkeeperCount(3)).toBe(false);
  });

  it('every offered duration is a duration a rate can be stored for', () => {
    for (const durationMinutes of DURATION_OPTIONS) {
      expect(() => new RentalRate({ id: `r-${durationMinutes}`, scope: 'city', refId: 'c', durationMinutes, amount: 1 })).not.toThrow();
    }
  });

  it('the slot step divides the hour, so slot marks repeat every hour', () => {
    expect(60 % SLOT_STEP_MINUTES).toBe(0);
  });
});

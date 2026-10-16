import { describe, expect, it } from 'vitest';
import { buffersAboveFreeCancellation, noticeViolations, removedRequiredSettings } from '../../../../src/domain/pricing/effectiveRules.js';

const DEFAULTS = { travelBufferMinutes: 30, freeCancellationMinutes: 60 };
const level = (rules: Partial<{ minNoticeMinutes: number; travelBufferMinutes: number; freeCancellationMinutes: number }>) => ({
  minNoticeMinutes: null,
  travelBufferMinutes: null,
  freeCancellationMinutes: null,
  ...rules,
});
const colombia = (rules: Parameters<typeof level>[0]) => ({ name: 'Colombia', rules: level(rules) });

describe('noticeViolations', () => {
  it('accepts a minimum notice above the travel buffer everywhere', () => {
    expect(noticeViolations(colombia({ minNoticeMinutes: 60, travelBufferMinutes: 30 }), [{ id: 'med', name: 'Medellín', rules: level({ travelBufferMinutes: 45 }) }], DEFAULTS)).toEqual([]);
  });

  it('refuses the country when its own notice is not above its buffer', () => {
    expect(noticeViolations(colombia({ minNoticeMinutes: 30, travelBufferMinutes: 30 }), [], DEFAULTS)).toEqual([
      { marketId: null, marketName: 'Colombia', minNoticeMinutes: 30, travelBufferMinutes: 30, origins: { minNoticeMinutes: 'country', travelBufferMinutes: 'country' } },
    ]);
  });

  it('names the city the inherited notice leaves below its own buffer', () => {
    expect(
      noticeViolations(colombia({ minNoticeMinutes: 30 }), [{ id: 'med', name: 'Medellín', rules: level({ travelBufferMinutes: 45 }) }], DEFAULTS),
    ).toEqual([
      { marketId: null, marketName: 'Colombia', minNoticeMinutes: 30, travelBufferMinutes: 30, origins: { minNoticeMinutes: 'country', travelBufferMinutes: 'platform' } },
      { marketId: 'med', marketName: 'Medellín', minNoticeMinutes: 30, travelBufferMinutes: 45, origins: { minNoticeMinutes: 'country', travelBufferMinutes: 'market' } },
    ]);
  });

  it('cannot judge a level with no minimum notice at all', () => {
    expect(noticeViolations(colombia({}), [{ id: 'med', name: 'Medellín', rules: level({ travelBufferMinutes: 45 }) }], DEFAULTS)).toEqual([]);
  });
});

describe('buffersAboveFreeCancellation', () => {
  it('lists the levels whose travel buffer exceeds their free cancellation', () => {
    expect(
      buffersAboveFreeCancellation(
        colombia({ travelBufferMinutes: 30, freeCancellationMinutes: 40 }),
        [
          { id: 'med', name: 'Medellín', rules: level({ travelBufferMinutes: 45 }) },
          { id: 'cal', name: 'Cali', rules: level({ freeCancellationMinutes: 90, travelBufferMinutes: 60 }) },
        ],
        DEFAULTS,
      ),
    ).toEqual(['Medellín']);
  });

  it('uses the defaults where nobody sets a value', () => {
    expect(buffersAboveFreeCancellation(colombia({ travelBufferMinutes: 90 }), [], DEFAULTS)).toEqual(['Colombia']);
  });
});

describe('removedRequiredSettings', () => {
  const full = { bookingWindowDays: 7, minNoticeMinutes: 60, leadTimeSurcharge: { tiers: [] } };

  it('names the required values the country had and no longer has', () => {
    expect(removedRequiredSettings(full, { ...full, bookingWindowDays: null, leadTimeSurcharge: null })).toEqual(['bookingWindowDays', 'leadTimeSurcharge']);
  });

  it('is empty for a first save or when nothing required is removed', () => {
    expect(removedRequiredSettings(null, { bookingWindowDays: null, minNoticeMinutes: null, leadTimeSurcharge: null })).toEqual([]);
    expect(removedRequiredSettings(full, full)).toEqual([]);
  });
});

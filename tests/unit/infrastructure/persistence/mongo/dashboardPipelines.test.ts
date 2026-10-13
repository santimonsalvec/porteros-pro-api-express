import { describe, expect, it } from 'vitest';
import type { Document } from 'mongodb';
import {
  goalkeepersSummaryPipeline,
  matchesPipeline,
  toGoalkeepersArea,
  toRequestsArea,
  toWalletsArea,
  walletsByCurrencyPipeline,
} from '../../../../../src/infrastructure/persistence/mongo/dashboardPipelines.js';
import { requestStatusExpression } from '../../../../../src/infrastructure/persistence/mongo/requestAdminPipelines.js';

const stage = (pipeline: Document[], name: string) => pipeline.filter((step) => name in step);

const WEEK = { from: new Date('2026-10-12T05:00:00.000Z'), to: new Date('2026-10-19T05:00:00.000Z') };
const TODAY = { from: new Date('2026-10-13T05:00:00.000Z'), to: new Date('2026-10-14T05:00:00.000Z') };
const DAYS = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
const windows = { today: TODAY, week: WEEK, days: DAYS };

describe('matchesPipeline (admin spec 008, research §3)', () => {
  it("reads the week's matches by their date (index startsAt_id), with each request's status and bookings", () => {
    const pipeline = matchesPipeline(windows, null, 'America/Bogota');

    expect(pipeline[0]).toEqual({ $match: { startsAt: { $gte: WEEK.from, $lt: WEEK.to } } });
    expect(stage(pipeline, '$lookup')[0]).toEqual({
      $lookup: { from: 'bookings', localField: '_id', foreignField: 'requestId', as: 'bookings', pipeline: [{ $project: { _id: 0, status: 1 } }] },
    });
    const projected = stage(pipeline, '$project').at(-1)!.$project;
    expect(projected.status).toEqual(requestStatusExpression());
    expect(projected.day).toEqual({ $dateToString: { date: '$startsAt', format: '%Y-%m-%d', timezone: 'America/Bogota' } });
    expect(projected.today).toEqual({ $and: [{ $gte: ['$startsAt', TODAY.from] }, { $lt: ['$startsAt', TODAY.to] }] });
    expect(projected.bookingStatuses).toBe('$bookings.status');
  });

  it("narrows to the scope's cities (index city_startsAt) and counts nothing for a country without cities", () => {
    expect(matchesPipeline(windows, ['medellin', 'bello'], 'America/Bogota')[0]).toEqual({
      $match: { startsAt: { $gte: WEEK.from, $lt: WEEK.to }, 'match.cityId': { $in: ['medellin', 'bello'] } },
    });
    expect(matchesPipeline(windows, [], 'America/Bogota')[0]).toEqual({
      $match: { startsAt: { $gte: WEEK.from, $lt: WEEK.to }, 'match.cityId': { $in: [] } },
    });
  });

  it('counts requests and bookings by status for today and the week, and bookings by day, in one facet', () => {
    const facet = stage(matchesPipeline(windows, null, 'America/Bogota'), '$facet')[0]!.$facet;
    expect(Object.keys(facet)).toEqual(['requestsToday', 'requestsWeek', 'bookingsToday', 'bookingsWeek', 'bookingsByDay']);
    expect(facet.requestsToday).toEqual([{ $match: { today: true } }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
    expect(facet.requestsWeek).toEqual([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    expect(facet.bookingsToday).toEqual([{ $match: { today: true } }, { $unwind: '$bookingStatuses' }, { $group: { _id: '$bookingStatuses', count: { $sum: 1 } } }]);
    expect(facet.bookingsByDay).toEqual([{ $unwind: '$bookingStatuses' }, { $group: { _id: { day: '$day', status: '$bookingStatuses' }, count: { $sum: 1 } } }]);
  });
});

describe('toRequestsArea', () => {
  it('fills every status, in zero too, and the seven days of the week in order', () => {
    const area = toRequestsArea(
      {
        requestsToday: [{ _id: 'searching', count: 2 }, { _id: 'assigned', count: 1 }],
        requestsWeek: [{ _id: 'searching', count: 5 }],
        bookingsToday: [{ _id: 'pending_assignment', count: 3 }],
        bookingsWeek: [{ _id: 'pending_assignment', count: 4 }, { _id: 'goalkeeper_withdrew', count: 1 }],
        bookingsByDay: [{ _id: { day: '2026-10-13', status: 'pending_assignment' }, count: 3 }, { _id: { day: '2026-10-18', status: 'assigned' }, count: 1 }],
      },
      DAYS,
    );

    expect(area.requests.today).toEqual({ total: 3, byStatus: { searching: 2, partially_assigned: 0, assigned: 1, completed: 0, cancelled: 0, expired: 0, closed: 0 } });
    expect(area.requests.week.total).toBe(5);
    expect(area.bookings.today.byStatus).toEqual({ pending_assignment: 3, assigned: 0, cancelled: 0, expired: 0, goalkeeper_withdrew: 0, completed: 0 });
    expect(area.bookings.week.total).toBe(5);
    expect(area.bookings.weekByDay.map((day) => [day.date, day.counts.total])).toEqual(DAYS.map((date) => [date, date === '2026-10-13' ? 3 : date === '2026-10-18' ? 1 : 0]));
  });

  it('answers zeros without matches', () => {
    const area = toRequestsArea(undefined, DAYS);
    expect(area.requests.today.total).toBe(0);
    expect(area.bookings.weekByDay).toHaveLength(7);
  });
});

describe('goalkeepersSummaryPipeline (research §4, Clarifications)', () => {
  const NOW = new Date('2026-10-13T14:00:00.000Z');

  it('reads the active profiles of the scope (index cityId_activatedAt) with their block', () => {
    const pipeline = goalkeepersSummaryPipeline(['medellin'], NOW);
    expect(pipeline[0]).toEqual({ $match: { cityId: { $in: ['medellin'] } } });
    expect(stage(pipeline, '$lookup')[0]).toEqual({
      $lookup: { from: 'userBlocks', localField: 'userId', foreignField: '_id', as: 'block', pipeline: [{ $match: { blocked: true } }, { $project: { _id: 1 } }] },
    });
    expect(goalkeepersSummaryPipeline(null, NOW)[0]).not.toHaveProperty('$match');
  });

  it('counts suspended, blocked and available (offers on, not suspended and not blocked)', () => {
    const pipeline = goalkeepersSummaryPipeline(null, NOW);
    const flags = stage(pipeline, '$addFields')[0]!.$addFields;
    expect(flags.suspended).toEqual({ $gt: [{ $ifNull: ['$suspendedUntil', null] }, NOW] });
    expect(flags.blocked).toEqual({ $gt: [{ $size: '$block' }, 0] });
    expect(flags.offersOn).toEqual({ $ne: ['$availableForOffers', false] });
    expect(stage(pipeline, '$group')[0]).toEqual({
      $group: {
        _id: null,
        active: { $sum: 1 },
        suspended: { $sum: { $cond: ['$suspended', 1, 0] } },
        blocked: { $sum: { $cond: ['$blocked', 1, 0] } },
        available: { $sum: { $cond: [{ $and: ['$offersOn', { $not: ['$suspended'] }, { $not: ['$blocked'] }] }, 1, 0] } },
      },
    });
  });

  it('maps the group to the area, zeros without profiles', () => {
    expect(toGoalkeepersArea({ _id: null, active: 5, available: 3, suspended: 1, blocked: 1 })).toEqual({ active: 5, available: 3, suspended: 1, blocked: 1 });
    expect(toGoalkeepersArea(undefined)).toEqual({ active: 0, available: 0, suspended: 0, blocked: 0 });
  });
});

describe('walletsByCurrencyPipeline (research §5, FR-006)', () => {
  it("adds positive balances and debts apart, per currency, of the scope's goalkeepers", () => {
    expect(walletsByCurrencyPipeline(['gk-1', 'gk-2'])).toEqual([
      { $match: { _id: { $in: ['gk-1', 'gk-2'] } } },
      {
        $group: {
          _id: '$currency',
          balanceTotal: { $sum: { $max: ['$balance', 0] } },
          debtTotal: { $sum: { $min: ['$balance', 0] } },
          negativeCount: { $sum: { $cond: [{ $lt: ['$balance', 0] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    expect(walletsByCurrencyPipeline(null)[0]).toHaveProperty('$group');
  });

  it('never adds two currencies', () => {
    expect(
      toWalletsArea([
        { _id: 'COP', balanceTotal: 4_820_000, debtTotal: -126_400, negativeCount: 7 },
        { _id: 'USD', balanceTotal: 1_200, debtTotal: 0, negativeCount: 0 },
      ]),
    ).toEqual({
      byCurrency: [
        { currency: 'COP', balanceTotal: 4_820_000, debtTotal: -126_400, negativeCount: 7 },
        { currency: 'USD', balanceTotal: 1_200, debtTotal: 0, negativeCount: 0 },
      ],
    });
  });
});

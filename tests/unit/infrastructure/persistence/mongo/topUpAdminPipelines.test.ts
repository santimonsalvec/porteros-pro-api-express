import { describe, expect, it } from 'vitest';
import { TOP_UP_ADMIN_SORT, topUpAdminFilter } from '../../../../../src/infrastructure/persistence/mongo/topUpAdminPipelines.js';

// Admin spec 007, US1 (research §3): the admin's top-up filters, newest first.

describe('topUpAdminFilter', () => {
  it('is empty without filters', () => {
    expect(topUpAdminFilter({})).toEqual({});
  });

  it('combines status, country, goalkeeper and the creation range ([from, to))', () => {
    const from = new Date('2026-10-01T05:00:00.000Z');
    const to = new Date('2026-10-14T05:00:00.000Z');
    expect(topUpAdminFilter({ status: 'pending', countryId: 'country-co', goalkeeperId: 'gk-1', from, to })).toEqual({
      status: 'pending',
      countryId: 'country-co',
      goalkeeperId: 'gk-1',
      createdAt: { $gte: from, $lt: to },
    });
    expect(topUpAdminFilter({ to })).toEqual({ createdAt: { $lt: to } });
  });

  it('sorts newest first with a stable tie-break', () => {
    expect(TOP_UP_ADMIN_SORT).toEqual({ createdAt: -1, _id: -1 });
  });
});

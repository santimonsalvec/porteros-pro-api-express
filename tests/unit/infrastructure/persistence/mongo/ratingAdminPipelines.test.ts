import { describe, expect, it } from 'vitest';
import { ratingsMatch } from '../../../../../src/infrastructure/persistence/mongo/ratingAdminPipelines.js';

describe('ratingsMatch (admin spec 006, US4)', () => {
  it('filters nothing without filters', () => {
    expect(ratingsMatch({})).toEqual({});
  });

  it("finds a goalkeeper's ratings whether they wrote or received them, and a client's likewise", () => {
    expect(ratingsMatch({ goalkeeperId: 'gk-1' })).toEqual({
      $and: [{ $or: [{ authorId: 'gk-1', side: 'goalkeeper' }, { subjectId: 'gk-1', side: 'client' }] }],
    });
    expect(ratingsMatch({ clientId: 'c-1', goalkeeperId: 'gk-1' })).toEqual({
      $and: [
        { $or: [{ authorId: 'gk-1', side: 'goalkeeper' }, { subjectId: 'gk-1', side: 'client' }] },
        { $or: [{ authorId: 'c-1', side: 'client' }, { subjectId: 'c-1', side: 'goalkeeper' }] },
      ],
    });
  });

  it('filters by side, stars and dates', () => {
    const from = new Date('2026-09-19T05:00:00.000Z');
    const to = new Date('2026-10-19T05:00:00.000Z');

    expect(ratingsMatch({ side: 'client', starsMin: 1, starsMax: 2, from, to })).toEqual({
      side: 'client',
      stars: { $gte: 1, $lte: 2 },
      createdAt: { $gte: from, $lt: to },
    });
  });
});

describe('ratingsMatch, one bound at a time', () => {
  it('filters from some stars or up to some, and from a date or up to one', () => {
    const day = new Date('2026-10-01T05:00:00.000Z');
    expect(ratingsMatch({ starsMin: 4 })).toEqual({ stars: { $gte: 4 } });
    expect(ratingsMatch({ starsMax: 2 })).toEqual({ stars: { $lte: 2 } });
    expect(ratingsMatch({ from: day })).toEqual({ createdAt: { $gte: day } });
    expect(ratingsMatch({ to: day })).toEqual({ createdAt: { $lt: day } });
  });
});

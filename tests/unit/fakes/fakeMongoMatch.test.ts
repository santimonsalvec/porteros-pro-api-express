import { describe, expect, it } from 'vitest';
import { matchesDocument } from '../../fakes/fakeMongoMatch.js';

describe('matchesDocument', () => {
  it('evaluates $and, $or and $regex as before', () => {
    const doc = { firstName: 'Laura', lastName: 'Gómez' };
    expect(matchesDocument({ $and: [{ firstName: { $regex: '^lau', $options: 'i' } }, { lastName: { $regex: 'g[oó]mez', $options: 'i' } }] }, doc)).toBe(true);
    expect(matchesDocument({ $or: [{ firstName: { $regex: 'ana' } }, { lastName: { $regex: 'Gó' } }] }, doc)).toBe(true);
    expect(matchesDocument({ firstName: { $regex: 'ana' } }, doc)).toBe(false);
  });

  it('evaluates $gt and $eq on numbers (admin spec 006: booking counts)', () => {
    const counts = { pending: 0, assigned: 2 };
    expect(matchesDocument({ assigned: { $gt: 0 } }, counts)).toBe(true);
    expect(matchesDocument({ pending: { $gt: 0 } }, counts)).toBe(false);
    expect(matchesDocument({ pending: { $eq: 0 } }, counts)).toBe(true);
    expect(matchesDocument({ $and: [{ pending: { $eq: 0 } }, { assigned: { $gt: 1 } }] }, counts)).toBe(true);
    expect(matchesDocument({ missing: { $eq: 0 } }, counts)).toBe(false);
  });
});

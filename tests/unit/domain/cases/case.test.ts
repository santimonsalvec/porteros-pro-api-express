import { describe, expect, it } from 'vitest';
import { SupportCase } from '../../../../src/domain/cases/case.js';

const opened = SupportCase.open({
  id: 'c-1',
  type: 'goalkeeper_no_show',
  bookingId: 'b',
  requestId: 'r',
  clientId: 'cl',
  goalkeeperId: 'g',
  ratingId: 'rt',
  checkIn: null,
  noShowIncidentId: 'w-1',
  createdAt: new Date('2026-10-05T00:00:00.000Z'),
});

describe('SupportCase (feature 021)', () => {
  it('opens and resolves once with a 3–500 character note', () => {
    expect(opened).toMatchObject({ status: 'open', resolution: null });
    const at = new Date('2026-10-05T10:00:00.000Z');
    const resolved = opened.resolve({ by: 'admin-1', at, note: '  Se habló con ambos ' });
    expect(resolved).toMatchObject({ status: 'resolved', resolution: { by: 'admin-1', at, note: 'Se habló con ambos' } });
    expect(() => resolved.resolve({ by: 'admin-1', at, note: 'Otra vez' })).toThrow(/already resolved/);
    expect(() => opened.resolve({ by: 'admin-1', at, note: 'no' })).toThrow(/between 3 and 500/);
  });
});

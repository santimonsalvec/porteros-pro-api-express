import { describe, expect, it } from 'vitest';
import { normalizeCancellationNote } from '../../../../src/domain/bookings/booking.js';

describe('normalizeCancellationNote (feature 017)', () => {
  it('trims the reason and treats blank as no reason', () => {
    expect(normalizeCancellationNote('  Un amigo cubre el arco ')).toBe('Un amigo cubre el arco');
    expect(normalizeCancellationNote('   ')).toBeNull();
    expect(normalizeCancellationNote(undefined)).toBeNull();
    expect(normalizeCancellationNote(null)).toBeNull();
  });

  it('accepts 200 characters and refuses 201', () => {
    expect(normalizeCancellationNote('a'.repeat(200))).toHaveLength(200);
    expect(() => normalizeCancellationNote('a'.repeat(201))).toThrow(/200/);
  });
});

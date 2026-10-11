import { describe, expect, it } from 'vitest';
import { readRevision } from '../../../../src/domain/common/revision.js';
import { InvalidConfigurationError } from '../../../../src/domain/pricing/invalidConfigurationError.js';

describe('readRevision', () => {
  it('is 0 when the document has none (seeded data)', () => {
    expect(readRevision(undefined, 'cities document x')).toBe(0);
    expect(readRevision(null, 'cities document x')).toBe(0);
  });

  it('keeps a non-negative integer', () => {
    expect(readRevision(0, 'w')).toBe(0);
    expect(readRevision(7, 'w')).toBe(7);
  });

  it.each([-1, 1.5, '2', Number.NaN])('rejects %s as broken configuration', (value) => {
    expect(() => readRevision(value, 'zones document z')).toThrow(InvalidConfigurationError);
    expect(() => readRevision(value, 'zones document z')).toThrow(/zones document z: revision/);
  });
});

import { describe, expect, it } from 'vitest';
import { InvalidConfigurationError } from '../../../../src/domain/pricing/invalidConfigurationError.js';
import { MatchSurface } from '../../../../src/domain/pricing/matchSurface.js';

const valid = { id: 'synthetic_grass', name: ' Grama sintética ', active: true, order: 1 };

describe('MatchSurface', () => {
  it('builds a valid surface with a trimmed name', () => {
    expect(new MatchSurface(valid)).toMatchObject({ id: 'synthetic_grass', name: 'Grama sintética', active: true, order: 1 });
  });

  it.each([
    ['an empty id', { id: '' }],
    ['a blank name', { name: ' ' }],
    ['a non-boolean active flag', { active: 'yes' }],
    ['a fractional order', { order: 1.5 }],
  ])('rejects %s', (_label, override) => {
    expect(() => new MatchSurface({ ...valid, ...override } as never)).toThrow(InvalidConfigurationError);
  });
});

describe('MatchSurface revision', () => {
  it('defaults to 0 and keeps a stored value', () => {
    expect(new MatchSurface(valid).revision).toBe(0);
    expect(new MatchSurface({ ...valid, revision: 5 }).revision).toBe(5);
  });

  it('rejects a broken revision', () => {
    expect(() => new MatchSurface({ ...valid, revision: -1 })).toThrow(/matchSurfaces document synthetic_grass: revision/);
  });
});

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

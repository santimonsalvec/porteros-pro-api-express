import { describe, expect, it } from 'vitest';
import { userSearchMatch } from '../../../../../../src/application/features/users/common/userSearch.js';

type Condition = Record<string, { $regex: string; $options?: string }>;

/** Evaluates the `$match` the way Mongo would, for the fields these tests use. */
function matches(match: Record<string, unknown>, user: Record<string, string | undefined>): boolean {
  if ('$and' in match) return (match.$and as Record<string, unknown>[]).every((part) => matches(part, user));
  if ('$or' in match) return (match.$or as Record<string, unknown>[]).some((part) => matches(part, user));
  const [field, condition] = Object.entries(match as Condition)[0]!;
  const value = user[field];
  return value !== undefined && new RegExp(condition.$regex, condition.$options ?? '').test(value);
}

const LAURA = { firstName: 'Laura', lastName: 'Gómez', email: 'laura.gomez+1@correo.co', normalizedPhoneNumber: '573001234567' };
const NUNEZ = { firstName: 'Andrés', lastName: 'Núñez', email: 'andres@correo.co', normalizedPhoneNumber: '573109998877' };
const GOOGLE_ONLY = { displayName: 'Ana María Ruiz', email: 'ana@correo.co' };

describe('userSearchMatch (admin spec 005, research §4)', () => {
  it('finds a name by its words, without accents or case', () => {
    for (const q of ['laura gómez', 'laura gomez', 'GÓMEZ', 'gom', 'Gomez Laura']) {
      expect(matches(userSearchMatch(q)!, LAURA), q).toBe(true);
    }
    expect(matches(userSearchMatch('laura ruiz')!, LAURA)).toBe(false);
  });

  it('matches ñ and accents both ways', () => {
    expect(matches(userSearchMatch('nunez')!, NUNEZ)).toBe(true);
    expect(matches(userSearchMatch('núñez')!, NUNEZ)).toBe(true);
    expect(matches(userSearchMatch('andres')!, NUNEZ)).toBe(true);
  });

  it('looks at the Google name of a user without a complete profile', () => {
    expect(matches(userSearchMatch('maria ruiz')!, GOOGLE_ONLY)).toBe(true);
  });

  it('searches an email as an escaped substring', () => {
    const match = userSearchMatch('gomez+1@correo')!;
    expect(Object.keys(match)).toEqual(['email']);
    expect(matches(match, LAURA)).toBe(true);
    expect(matches(userSearchMatch('a.b@x')!, { email: 'aXb@x' })).toBe(false);
  });

  it('searches a phone by its last digits, with or without the country code', () => {
    for (const q of ['3001234567', '+57 300-123 4567', '(300) 123 4567', '1234567']) {
      const match = userSearchMatch(q)!;
      expect(Object.keys(match), q).toEqual(['normalizedPhoneNumber']);
      expect(matches(match, LAURA), q).toBe(true);
    }
    expect(matches(userSearchMatch('3001234568')!, LAURA)).toBe(false);
  });

  it('treats six digits or fewer as a name, not a phone', () => {
    expect(Object.keys(userSearchMatch('123456')!)).toEqual(['$and']);
  });

  it('does not filter with fewer than 2 characters', () => {
    expect(userSearchMatch('')).toBeNull();
    expect(userSearchMatch(' a ')).toBeNull();
  });

  it('escapes regex characters', () => {
    expect(() => new RegExp((userSearchMatch('(.*') as { $and: { $or: Condition[] }[] }).$and[0]!.$or[0]!.firstName!.$regex)).not.toThrow();
    expect(matches(userSearchMatch('l.ura')!, LAURA)).toBe(false);
  });
});

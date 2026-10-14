import { describe, expect, it } from 'vitest';
import { maskEmail, normalizeEmail } from '../../../../src/domain/common/email.js';
import { normalizeStaffEmail } from '../../../../src/domain/staff/staffMember.js';

describe('normalizeEmail', () => {
  it('trims and lower-cases a valid address', () => {
    expect(normalizeEmail('  Juana.Perez@Gmail.COM ')).toBe('juana.perez@gmail.com');
  });

  it('rejects anything that is not an email', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('juana')).toBeNull();
    expect(normalizeEmail('juana@')).toBeNull();
    expect(normalizeEmail('juana@gmail')).toBeNull();
    expect(normalizeEmail('a b@gmail.com')).toBeNull();
    expect(normalizeEmail(`${'a'.repeat(250)}@gmail.com`)).toBeNull();
  });

  it('is the rule the team members already use', () => {
    expect(normalizeStaffEmail).toBe(normalizeEmail);
  });
});

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('juana.perez@gmail.com')).toBe('j***@gmail.com');
  });

  it('masks a one-letter local part too', () => {
    expect(maskEmail('a@porteros.pro')).toBe('a***@porteros.pro');
  });

  it('never returns the raw value of something that is not an email', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });
});

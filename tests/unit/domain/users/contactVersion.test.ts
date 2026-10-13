import { describe, expect, it } from 'vitest';
import { contactVersion, documentVersion } from '../../../../src/domain/users/contactVersion.js';

const CONTACT = { firstName: 'Laura', lastName: 'Gómez', countryCallingCode: '+57', normalizedPhoneNumber: '573001234567' };

describe('contactVersion (admin spec 005, research §9)', () => {
  it('is 16 stable hex characters', () => {
    expect(contactVersion(CONTACT)).toMatch(/^[0-9a-f]{16}$/);
    expect(contactVersion({ ...CONTACT })).toBe(contactVersion(CONTACT));
  });

  it.each(Object.keys(CONTACT))('changes when %s changes', (field) => {
    expect(contactVersion({ ...CONTACT, [field]: 'otro' })).not.toBe(contactVersion(CONTACT));
  });

  it('treats null and missing alike, and never mixes up adjacent fields', () => {
    expect(contactVersion({ firstName: null, lastName: null, countryCallingCode: null, normalizedPhoneNumber: null })).toBe(contactVersion({}));
    expect(contactVersion({ firstName: 'ab', lastName: 'c' })).not.toBe(contactVersion({ firstName: 'a', lastName: 'bc' }));
  });
});

describe('documentVersion', () => {
  it('changes with the type or the number', () => {
    const base = documentVersion({ documentType: 'CC', documentNumber: '1020304050' });
    expect(base).toMatch(/^[0-9a-f]{16}$/);
    expect(documentVersion({ documentType: 'CE', documentNumber: '1020304050' })).not.toBe(base);
    expect(documentVersion({ documentType: 'CC', documentNumber: '1020304051' })).not.toBe(base);
  });
});

import { describe, expect, it } from 'vitest';
import { ExternalIdentity } from '../../../../src/domain/users/externalIdentity.js';
import { User } from '../../../../src/domain/users/user.js';

describe('User.createFromVerifiedEmail (admin spec 009)', () => {
  it('creates an account with no external identity, found by its normalized email', () => {
    const user = User.createFromVerifiedEmail({ id: 'user-1', email: ' Juana.Perez@Gmail.com ' });
    expect(user.id).toBe('user-1');
    expect(user.email).toBe('juana.perez@gmail.com');
    expect(user.emailKey).toBe('juana.perez@gmail.com');
    expect(user.externalIdentities).toEqual([]);
    expect(user.isProfileComplete).toBe(false);
    expect(user.displayName).toBeNull();
  });

  it('refuses an address that is not an email', () => {
    expect(() => User.createFromVerifiedEmail({ id: 'user-1', email: 'juana' })).toThrow();
  });
});

describe('User.createFromExternalIdentity with emailVerified', () => {
  const params = { id: 'user-1', email: 'Juana@Gmail.com', displayName: null, provider: 'google', subject: 'sub-1' };

  it('sets the email key only when Google verified the address', () => {
    expect(User.createFromExternalIdentity({ ...params, emailVerified: true }).emailKey).toBe('juana@gmail.com');
    expect(User.createFromExternalIdentity({ ...params, emailVerified: false }).emailKey).toBeNull();
  });

  it('leaves it empty when the caller says nothing, as before', () => {
    expect(User.createFromExternalIdentity(params).emailKey).toBeNull();
  });
});

describe('User.linkExternalIdentity', () => {
  it('adds the identity once and keeps the email', () => {
    const user = User.createFromVerifiedEmail({ id: 'user-1', email: 'juana@gmail.com' });
    const identity = new ExternalIdentity('google', 'sub-1', 'Juana@Gmail.com');
    user.linkExternalIdentity(identity);
    user.linkExternalIdentity(identity);
    expect(user.externalIdentities).toEqual([identity]);
    expect(user.findExternalIdentity('google', 'sub-1')).toBe(identity);
    expect(user.email).toBe('juana@gmail.com');
  });
});

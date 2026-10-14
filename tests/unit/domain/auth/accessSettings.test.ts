import { describe, expect, it } from 'vitest';
import {
  accessSettingsOrDefault,
  isValidLoginCodeExpiry,
  LOGIN_CODE_EXPIRY_MINUTES,
} from '../../../../src/domain/auth/accessSettings.js';

describe('login code expiry', () => {
  it('goes from 1 to 10 minutes, 2 by default', () => {
    expect(LOGIN_CODE_EXPIRY_MINUTES).toEqual({ min: 1, max: 10, default: 2 });
  });

  it('accepts whole minutes between 1 and 10', () => {
    for (const minutes of [1, 2, 5, 10]) expect(isValidLoginCodeExpiry(minutes)).toBe(true);
  });

  it('rejects anything else', () => {
    for (const value of [0, 11, 2.5, -1, Number.NaN, Number.POSITIVE_INFINITY, '5', null, undefined]) {
      expect(isValidLoginCodeExpiry(value)).toBe(false);
    }
  });
});

describe('accessSettingsOrDefault', () => {
  it('is 2 minutes at revision 0 when nobody configured it', () => {
    expect(accessSettingsOrDefault(null)).toEqual({
      loginCodeExpiryMinutes: 2,
      isDefault: true,
      revision: 0,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it('is what was stored otherwise', () => {
    const updatedAt = new Date('2026-10-14T15:02:00.000Z');
    expect(accessSettingsOrDefault({ loginCodeExpiryMinutes: 5, revision: 3, updatedAt, updatedBy: 'user-1' })).toEqual({
      loginCodeExpiryMinutes: 5,
      isDefault: false,
      revision: 3,
      updatedAt,
      updatedBy: 'user-1',
    });
  });
});

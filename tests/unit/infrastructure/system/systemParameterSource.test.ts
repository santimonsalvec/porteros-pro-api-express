import { describe, expect, it } from 'vitest';
import { readSystemParameters } from '../../../../src/infrastructure/systemParameterSource.js';

const SECRETS = {
  MONGODB_CONNECTION_STRING: 'mongodb+srv://porteros:Sup3rS3cretPass@cluster0.example.net/app',
  JWT_SIGNING_KEY: 'jwt-signing-key-0123456789-abcdefghijklmnop',
  CLOUDINARY_URL: 'cloudinary://123456789012345:AbCdEfGhIjKlMnOp@porteros',
};

describe('readSystemParameters (admin spec 008, research §10)', () => {
  it('reads each value and says whether it is the default', () => {
    const { values } = readSystemParameters({ LEGAL_TERMS_VERSION: '1.2', INVOICING_ENABLED: 'true', OFFER_MAX_REMINDERS: '  ' });
    expect(values).toEqual([
      { name: 'OFFER_REMINDER_INTERVAL_MINUTES', value: 5, isDefault: true },
      { name: 'OFFER_MAX_REMINDERS', value: 3, isDefault: true },
      { name: 'LEGAL_TERMS_VERSION', value: '1.2', isDefault: false },
      { name: 'LEGAL_PRIVACY_POLICY_VERSION', value: '1.0', isDefault: true },
      { name: 'INVOICING_ENABLED', value: true, isDefault: false },
    ]);
  });

  it('says only whether each secret is there; empty or blank counts as missing', () => {
    const { secrets } = readSystemParameters({ ...SECRETS, CLOUDINARY_URL: '   ' });
    expect(secrets).toEqual([
      { name: 'MONGODB_CONNECTION_STRING', present: true },
      { name: 'JWT_SIGNING_KEY', present: true },
      { name: 'CLOUDINARY_URL', present: false },
    ]);
  });

  it('never carries a secret, not even a piece of one', () => {
    const answer = JSON.stringify(readSystemParameters(SECRETS));
    for (const secret of Object.values(SECRETS)) {
      for (let start = 0; start + 6 <= secret.length; start += 3) {
        const piece = secret.slice(start, start + 6);
        if (/^[a-z_]+$/i.test(piece) && answer.includes(piece)) continue; // a word the names share ("cloudinary")
        expect(answer, piece).not.toContain(piece);
      }
    }
  });
});

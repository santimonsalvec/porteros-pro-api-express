import { describe, expect, it } from 'vitest';
import { sha256TokenFingerprint, tokenHash, tokenRef } from '../../../../src/infrastructure/push/tokenRef.js';

describe('tokenRef', () => {
  it('hashes with sha256 into 64 hex characters', () => {
    expect(tokenHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('refers to a token by the first 12 characters of its hash', () => {
    expect(tokenRef('abc')).toBe('ba7816bf8f01');
    expect(sha256TokenFingerprint.ref('abc')).toBe('ba7816bf8f01');
  });

  it('gives different tokens different refs', () => {
    expect(tokenRef('token-a')).not.toBe(tokenRef('token-b'));
  });
});

import { describe, expect, it, vi } from 'vitest';
import { CryptoOneTimeCodeGenerator } from '../../../../src/infrastructure/auth/cryptoOneTimeCodeGenerator.js';
import { HmacLoginCodeHasher } from '../../../../src/infrastructure/auth/hmacLoginCodeHasher.js';

describe('CryptoOneTimeCodeGenerator (admin spec 009, research §2)', () => {
  it('draws from [0, 1 000 000) and always gives six digits, leading zeros included', () => {
    const randomInt = vi.fn<(min: number, max: number) => number>().mockReturnValueOnce(42).mockReturnValueOnce(999_999).mockReturnValueOnce(0);
    const generator = new CryptoOneTimeCodeGenerator(randomInt);

    expect([generator.next(), generator.next(), generator.next()]).toEqual(['000042', '999999', '000000']);
    expect(randomInt).toHaveBeenCalledWith(0, 1_000_000);
  });

  it('uses the cryptographic generator by default', () => {
    expect(new CryptoOneTimeCodeGenerator().next()).toMatch(/^\d{6}$/);
  });
});

describe('HmacLoginCodeHasher (admin spec 009, research §2)', () => {
  const hasher = new HmacLoginCodeHasher(() => 'test-signing-key');
  const input = { audience: 'app' as const, email: 'juana@gmail.com', code: '042917' };

  it('gives the same hash for the same product, address and code', () => {
    expect(hasher.hash(input)).toBe(hasher.hash({ ...input }));
    expect(hasher.hash(input)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives another hash for another product, address, code or key', () => {
    const hash = hasher.hash(input);
    expect(hasher.hash({ ...input, audience: 'admin' })).not.toBe(hash);
    expect(hasher.hash({ ...input, email: 'pedro@gmail.com' })).not.toBe(hash);
    expect(hasher.hash({ ...input, code: '042918' })).not.toBe(hash);
    expect(new HmacLoginCodeHasher(() => 'another-key').hash(input)).not.toBe(hash);
  });

  it('never carries the code', () => {
    expect(hasher.hash(input)).not.toContain('042917');
  });
});

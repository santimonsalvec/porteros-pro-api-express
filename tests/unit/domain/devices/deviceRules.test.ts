import { describe, expect, it } from 'vitest';
import { normalizeToken, validatePushMessage, type PushMessage } from '../../../../src/domain/devices/deviceRules.js';

const message = (overrides: Partial<PushMessage> = {}): PushMessage => ({
  title: 'PorterosPRO',
  body: 'Hay un partido disponible',
  data: { type: 'test' },
  ...overrides,
});

describe('normalizeToken', () => {
  it('trims the token', () => {
    expect(normalizeToken('  abc  ')).toBe('abc');
  });

  it('accepts 1 to 4,096 characters', () => {
    expect(normalizeToken('a')).toBe('a');
    expect(normalizeToken('a'.repeat(4096))).toHaveLength(4096);
  });

  it('rejects an empty, blank or 4,097-character token', () => {
    expect(normalizeToken('')).toBeNull();
    expect(normalizeToken('   ')).toBeNull();
    expect(normalizeToken('a'.repeat(4097))).toBeNull();
  });
});

describe('validatePushMessage', () => {
  it('accepts a well-formed message', () => {
    expect(validatePushMessage(message())).toEqual({ ok: true });
  });

  it('bounds the title and body', () => {
    expect(validatePushMessage(message({ title: '' }))).toEqual({ ok: false, reason: 'title_length' });
    expect(validatePushMessage(message({ title: 'a'.repeat(101) }))).toEqual({ ok: false, reason: 'title_length' });
    expect(validatePushMessage(message({ body: '' }))).toEqual({ ok: false, reason: 'body_length' });
    expect(validatePushMessage(message({ body: 'a'.repeat(501) }))).toEqual({ ok: false, reason: 'body_length' });
  });

  it('requires a type in the data', () => {
    expect(validatePushMessage(message({ data: { bookingId: 'b-1' } }))).toEqual({ ok: false, reason: 'missing_type' });
  });

  it('allows at most 20 data keys, all strings', () => {
    const data = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`k${index}`, 'v']));
    expect(validatePushMessage(message({ data: { ...data, type: 'test' } }))).toEqual({ ok: false, reason: 'too_many_data_keys' });
    const nonString = { type: 'test', count: 3 } as unknown as Record<string, string>;
    expect(validatePushMessage(message({ data: nonString }))).toEqual({ ok: false, reason: 'non_string_data' });
  });

  it('rejects a message over 3 KB', () => {
    expect(validatePushMessage(message({ data: { type: 'test', blob: 'x'.repeat(3000) } }))).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });
});

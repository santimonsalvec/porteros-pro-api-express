import { describe, expect, it } from 'vitest';
import { Region } from '../../../../src/domain/locations/region.js';

describe('Region revision', () => {
  it('defaults to 0 and keeps a stored value', () => {
    expect(new Region({ id: 'ant', name: 'Antioquia' }).revision).toBe(0);
    expect(new Region({ id: 'ant', name: 'Antioquia', revision: 2 }).revision).toBe(2);
  });

  it('rejects a broken revision', () => {
    expect(() => new Region({ id: 'ant', name: 'Antioquia', revision: 1.5 })).toThrow(/regions document ant: revision/);
  });
});

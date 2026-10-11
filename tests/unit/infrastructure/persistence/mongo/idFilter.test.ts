import { describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { idFilter } from '../../../../../src/infrastructure/persistence/mongo/idFilter.js';

describe('idFilter', () => {
  it('matches the text id or the ObjectId when the text has an ObjectId shape', () => {
    const hex = '65f1c2a9b3e4d5f6a7b8c9d0';
    const filter = idFilter(hex) as { _id: { $in: unknown[] } };

    expect(filter._id.$in[0]).toBe(hex);
    expect(filter._id.$in[1]).toBeInstanceOf(ObjectId);
    expect(String(filter._id.$in[1])).toBe(hex);
  });

  it.each(['medellin', '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', '65F1C2A9B3E4D5F6A7B8C9D0x'])('uses the text id as is for %s', (id) => {
    expect(idFilter(id)).toEqual({ _id: id });
  });
});

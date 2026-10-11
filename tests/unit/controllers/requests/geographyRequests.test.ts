import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  acknowledgeWarningsField,
  deleteRequestSchema,
  pageQuery,
  revisionField,
  searchField,
} from '../../../../src/controllers/requests/geography/geographyRequests.js';

describe('geography request schemas', () => {
  it('pages default to 1 and 20 and stay within bounds', () => {
    const schema = z.object(pageQuery);
    expect(schema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(schema.parse({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 });
    expect(schema.safeParse({ pageSize: '51' }).success).toBe(false);
    expect(schema.safeParse({ page: '0' }).success).toBe(false);
    expect(schema.safeParse({ page: 'x' }).success).toBe(false);
  });

  it('a search is 1 to 80 characters, trimmed', () => {
    const schema = z.object({ q: searchField });
    expect(schema.parse({ q: '  Mede ' })).toEqual({ q: 'Mede' });
    expect(schema.parse({})).toEqual({});
    expect(schema.safeParse({ q: 'x'.repeat(81) }).success).toBe(false);
  });

  it('an edit carries the revision it read, a whole number from 0', () => {
    const schema = z.object({ revision: revisionField });
    expect(schema.parse({ revision: 0 })).toEqual({ revision: 0 });
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ revision: -1 }).success).toBe(false);
    expect(schema.safeParse({ revision: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ revision: '1' }).success).toBe(false);
  });

  it('acknowledging warnings is an optional boolean', () => {
    const schema = z.object({ acknowledgeWarnings: acknowledgeWarningsField });
    expect(schema.parse({})).toEqual({});
    expect(schema.parse({ acknowledgeWarnings: true })).toEqual({ acknowledgeWarnings: true });
    expect(schema.safeParse({ acknowledgeWarnings: 'yes' }).success).toBe(false);
  });

  it('a delete needs a reason of 3 to 300 characters', () => {
    expect(deleteRequestSchema.parse({ reason: ' Duplicada ' })).toEqual({ reason: 'Duplicada' });
    expect(deleteRequestSchema.safeParse({}).success).toBe(false);
    expect(deleteRequestSchema.safeParse({ reason: 'no' }).success).toBe(false);
    expect(deleteRequestSchema.safeParse({ reason: 'x'.repeat(301) }).success).toBe(false);
    expect(deleteRequestSchema.safeParse({ reason: 'Duplicada', extra: 1 }).success).toBe(false);
  });
});

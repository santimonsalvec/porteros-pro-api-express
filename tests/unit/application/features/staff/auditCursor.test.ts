import { describe, expect, it } from 'vitest';
import { decodeAuditCursor, encodeAuditCursor } from '../../../../../src/application/features/staff/common/auditCursor.js';

describe('audit cursor', () => {
  it('goes back and forth, as base64url without padding', () => {
    const position = { at: new Date('2026-10-08T15:00:00.000Z'), id: '0199a1b2-0000-7000-8000-000000000001' };

    const cursor = encodeAuditCursor(position);

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeAuditCursor(cursor)).toEqual(position);
  });

  it('is null for anything that is not one', () => {
    const encode = (text: string) => Buffer.from(text, 'utf8').toString('base64url');
    expect(decodeAuditCursor('not base64 !!')).toBeNull();
    expect(decodeAuditCursor(encode('no-separator'))).toBeNull();
    expect(decodeAuditCursor(encode('not-a-date|id-1'))).toBeNull();
    expect(decodeAuditCursor(encode('2026-10-08T15:00:00.000Z|'))).toBeNull();
    expect(decodeAuditCursor('')).toBeNull();
  });
});

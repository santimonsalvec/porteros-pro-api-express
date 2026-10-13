import { describe, expect, it } from 'vitest';
import { blockReasonIssue, BLOCK_REASON_MAX } from '../../../../src/domain/users/userBlock.js';

describe('the reason of a block or unblock (admin spec 005, FR-026)', () => {
  it('accepts 3 to 300 characters, trimmed', () => {
    expect(blockReasonIssue('Acoso a clientes')).toBeNull();
    expect(blockReasonIssue('  abc  ')).toBeNull();
    expect(blockReasonIssue('x'.repeat(BLOCK_REASON_MAX))).toBeNull();
  });

  it('refuses a reason too short, empty or too long', () => {
    expect(blockReasonIssue(' ab ')).toEqual(expect.any(String));
    expect(blockReasonIssue('')).toEqual(expect.any(String));
    expect(blockReasonIssue('x'.repeat(BLOCK_REASON_MAX + 1))).toEqual(expect.any(String));
  });
});

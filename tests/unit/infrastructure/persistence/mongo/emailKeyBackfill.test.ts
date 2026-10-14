import { describe, expect, it } from 'vitest';
import { planEmailKeyBackfill, type BackfillUser } from '../../../../../src/infrastructure/persistence/mongo/emailKeyBackfill.js';

const user = (id: string, email: string, createdAt: string, extra: Partial<BackfillUser> = {}): BackfillUser => ({
  id,
  email,
  createdAt: new Date(createdAt),
  emailKey: null,
  hasExternalIdentity: true,
  ...extra,
});

describe('planEmailKeyBackfill (admin spec 009, research §4)', () => {
  it('gives each Google account its normalized email as key', () => {
    const plan = planEmailKeyBackfill([user('u1', ' Juana@Gmail.com ', '2026-01-01'), user('u2', 'pedro@gmail.com', '2026-02-01')]);
    expect(plan.updates).toEqual([
      { id: 'u1', emailKey: 'juana@gmail.com' },
      { id: 'u2', emailKey: 'pedro@gmail.com' },
    ]);
    expect(plan.duplicates).toEqual([]);
  });

  it('keeps only the oldest account of a repeated email and reports the group', () => {
    const plan = planEmailKeyBackfill([
      user('newer', 'juana@gmail.com', '2026-05-01'),
      user('oldest', 'JUANA@gmail.com', '2026-01-01'),
      user('middle', 'juana@gmail.com ', '2026-03-01'),
    ]);
    expect(plan.updates).toEqual([{ id: 'oldest', emailKey: 'juana@gmail.com' }]);
    expect(plan.duplicates).toEqual([{ emailKey: 'juana@gmail.com', keptId: 'oldest', skippedIds: ['middle', 'newer'] }]);
  });

  it('leaves alone the accounts that already have a key, and gives nobody else that key', () => {
    const plan = planEmailKeyBackfill([
      user('has-key', 'juana@gmail.com', '2026-06-01', { emailKey: 'juana@gmail.com' }),
      user('older', 'juana@gmail.com', '2026-01-01'),
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.duplicates).toEqual([{ emailKey: 'juana@gmail.com', keptId: 'has-key', skippedIds: ['older'] }]);
  });

  it('skips accounts without a Google identity or without a valid address', () => {
    const plan = planEmailKeyBackfill([user('no-identity', 'ana@gmail.com', '2026-01-01', { hasExternalIdentity: false }), user('bad', 'not-an-email', '2026-01-01')]);
    expect(plan.updates).toEqual([]);
    expect(plan.invalidIds).toEqual(['bad']);
  });
});

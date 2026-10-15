import { describe, expect, it } from 'vitest';
import { AccountClosure, closureReasonIssue } from '../../../../src/domain/accountClosures/accountClosure.js';

const NOW = new Date('2026-10-14T15:00:00Z');
const LATER = new Date('2026-10-15T09:00:00Z');

function requested(overrides: Partial<Parameters<typeof AccountClosure.request>[0]> = {}): AccountClosure {
  return AccountClosure.request({ id: 'c1', userId: 'u1', role: 'goalkeeper', balanceAtRequest: 13000, currency: 'COP', now: NOW, ...overrides });
}

function ok(result: { ok: boolean }): AccountClosure {
  if (!result.ok) throw new Error('expected a transition');
  return (result as { ok: true; closure: AccountClosure }).closure;
}

describe('AccountClosure', () => {
  it('starts requested, open, with the balance at that moment', () => {
    const closure = requested();
    expect(closure.status).toBe('requested');
    expect(closure.isOpen).toBe(true);
    expect(closure.balanceAtRequest).toBe(13000);
    expect(closure.requestedAt).toEqual(NOW);
    expect(closure.debtResolution).toBeNull();
    expect(closure.refund).toBeNull();
  });

  it('keeps no balance for a client', () => {
    const closure = requested({ role: 'client', balanceAtRequest: null, currency: null });
    expect(closure.balanceAtRequest).toBeNull();
  });

  describe('cancel (by the user)', () => {
    it('ends the request while the refund is not recorded', () => {
      const closure = ok(requested().cancel(LATER));
      expect(closure.status).toBe('cancelled');
      expect(closure.isOpen).toBe(false);
      expect(closure.endedAt).toEqual(LATER);
    });

    it('is refused once the refund is recorded', () => {
      const recorded = ok(requested().recordRefund({ by: 'a1', now: LATER, amount: 13000, reference: 'TRX-1', paidOn: '2026-10-15', note: null, movementId: 'm1' }));
      expect(recorded.cancel(LATER)).toEqual({ ok: false, reason: 'invalid_transition' });
    });
  });

  describe('reject (by an administrator)', () => {
    it('needs a reason of 3 to 300 characters', () => {
      expect(requested().reject({ by: 'a1', reason: 'ab', now: LATER })).toEqual({ ok: false, reason: 'reason_invalid' });
      expect(requested().reject({ by: 'a1', reason: 'x'.repeat(301), now: LATER })).toEqual({ ok: false, reason: 'reason_invalid' });
      const closure = ok(requested().reject({ by: 'a1', reason: '  Tiene partidos  ', now: LATER }));
      expect(closure.status).toBe('rejected');
      expect(closure.endReason).toBe('Tiene partidos');
      expect(closure.endedBy).toBe('a1');
    });

    it('is refused after the refund', () => {
      const recorded = ok(requested().recordRefund({ by: 'a1', now: LATER, amount: 0, reference: null, paidOn: null, note: null, movementId: null }));
      expect(recorded.reject({ by: 'a1', reason: 'Tiene partidos', now: LATER })).toEqual({ ok: false, reason: 'invalid_transition' });
    });
  });

  describe('debt', () => {
    const indebted = () => requested({ balanceAtRequest: -30000 });

    it('asks for a deposit that covers it, only with a negative balance', () => {
      const closure = ok(indebted().requireDebtDeposit({ by: 'a1', now: LATER, balance: -30000 }));
      expect(closure.status).toBe('requested');
      expect(closure.debtResolution).toBe('deposit_required');
      expect(closure.debtResolvedBy).toBe('a1');
      expect(requested().requireDebtDeposit({ by: 'a1', now: LATER, balance: 13000 })).toEqual({ ok: false, reason: 'debt_not_applicable' });
    });

    it('is waived with a reason, only with a negative balance', () => {
      expect(indebted().waiveDebt({ by: 'a1', reason: '', now: LATER, balance: -30000 })).toEqual({ ok: false, reason: 'reason_invalid' });
      const closure = ok(indebted().waiveDebt({ by: 'a1', reason: 'Error de cobro', now: LATER, balance: -30000 }));
      expect(closure.debtResolution).toBe('waived');
      expect(closure.debtReason).toBe('Error de cobro');
      expect(requested().waiveDebt({ by: 'a1', reason: 'Error de cobro', now: LATER, balance: 0 })).toEqual({ ok: false, reason: 'debt_not_applicable' });
    });
  });

  describe('recordRefund', () => {
    it('needs a reference and a date when there is money to return', () => {
      const missing = requested().recordRefund({ by: 'a1', now: LATER, amount: 13000, reference: null, paidOn: null, note: null, movementId: 'm1' });
      expect(missing).toEqual({ ok: false, reason: 'refund_details_required' });
    });

    it('records the amount, the proof and the movement', () => {
      const closure = ok(requested().recordRefund({ by: 'a1', now: LATER, amount: 13000, reference: 'TRX-1', paidOn: '2026-10-15', note: 'Bancolombia', movementId: 'm1' }));
      expect(closure.status).toBe('refund_recorded');
      expect(closure.isOpen).toBe(true);
      expect(closure.refund).toEqual({ amount: 13000, reference: 'TRX-1', paidOn: '2026-10-15', note: 'Bancolombia', movementId: 'm1', recordedBy: 'a1', recordedAt: LATER });
    });

    it('accepts an amount of zero with no proof and no movement', () => {
      const closure = ok(requested().recordRefund({ by: 'a1', now: LATER, amount: 0, reference: null, paidOn: null, note: null, movementId: null }));
      expect(closure.refund?.amount).toBe(0);
    });

    it('is refused from any other state', () => {
      const cancelled = ok(requested().cancel(LATER));
      expect(cancelled.recordRefund({ by: 'a1', now: LATER, amount: 0, reference: null, paidOn: null, note: null, movementId: null })).toEqual({ ok: false, reason: 'invalid_transition' });
    });
  });

  describe('close and reopen', () => {
    const recorded = () => ok(requested().recordRefund({ by: 'a1', now: LATER, amount: 0, reference: null, paidOn: null, note: null, movementId: null }));

    it('closes only after the refund', () => {
      expect(requested().close({ by: 'a1', now: LATER })).toEqual({ ok: false, reason: 'invalid_transition' });
      const closed = ok(recorded().close({ by: 'a1', now: LATER }));
      expect(closed.status).toBe('closed');
      expect(closed.isOpen).toBe(false);
      expect(closed.closedAt).toEqual(LATER);
      expect(closed.closedBy).toBe('a1');
    });

    it('reopens a closed account when its user signs in again, once', () => {
      const closed = ok(recorded().close({ by: 'a1', now: LATER }));
      const reopened = ok(closed.reopen(new Date('2026-11-01T10:00:00Z')));
      expect(reopened.status).toBe('reopened');
      expect(reopened.reopenedAt).toEqual(new Date('2026-11-01T10:00:00Z'));
      expect(reopened.reopen(LATER)).toEqual({ ok: false, reason: 'invalid_transition' });
      expect(requested().reopen(LATER)).toEqual({ ok: false, reason: 'invalid_transition' });
    });
  });

  describe('allowedActions', () => {
    it('offers refund and reject with a balance and nothing pending', () => {
      expect(requested().allowedActions({ balance: 13000, blockers: 0 })).toEqual(['refund', 'reject']);
    });

    it('offers only reject while there are blockers', () => {
      expect(requested().allowedActions({ balance: 13000, blockers: 2 })).toEqual(['reject']);
    });

    it('offers the debt options before the debt is resolved', () => {
      expect(requested().allowedActions({ balance: -5000, blockers: 0 })).toEqual(['debt_deposit_required', 'waive_debt', 'reject']);
    });

    it('does not offer the deposit again once it was asked for', () => {
      const asked = ok(requested({ balanceAtRequest: -5000 }).requireDebtDeposit({ by: 'a1', now: LATER, balance: -5000 }));
      expect(asked.allowedActions({ balance: -5000, blockers: 0 })).toEqual(['waive_debt', 'reject']);
    });

    it('offers close after the refund and nothing once ended', () => {
      const recorded = ok(requested().recordRefund({ by: 'a1', now: LATER, amount: 0, reference: null, paidOn: null, note: null, movementId: null }));
      expect(recorded.allowedActions({ balance: 0, blockers: 0 })).toEqual(['close']);
      expect(ok(requested().cancel(LATER)).allowedActions({ balance: 0, blockers: 0 })).toEqual([]);
    });

    it('treats a client (no balance) like a zero balance', () => {
      const client = requested({ role: 'client', balanceAtRequest: null, currency: null });
      expect(client.allowedActions({ balance: null, blockers: 0 })).toEqual(['refund', 'reject']);
    });
  });

  it('rehydrates what it stores', () => {
    const closure = ok(requested().requireDebtDeposit({ by: 'a1', now: LATER, balance: -1 }));
    expect(AccountClosure.rehydrate(closure.toProps())).toEqual(closure);
  });

  it('closureReasonIssue trims and bounds', () => {
    expect(closureReasonIssue('  ab  ')).not.toBeNull();
    expect(closureReasonIssue('abc')).toBeNull();
    expect(closureReasonIssue('x'.repeat(301))).not.toBeNull();
  });
});
